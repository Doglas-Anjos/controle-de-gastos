"""Origem do banco em itens MeuPluggy, renomeio pelo usuario e colunas novas em banco antigo."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from gastos.api.main import app
from gastos.core.db import Base, garantir_colunas, get_session
from gastos.domain.models import Account, PluggyItem
from gastos.ingest.bancos import inferir_banco, montar_hint
from gastos.ingest.pluggy_sync import sincronizar

ITEM = "00000000-0000-4000-8000-0000000000aa"


@pytest.mark.parametrize(
    "conta, conector, esperado",
    [
        ({"name": "NuConta", "marketingName": None}, "MeuPluggy", "Nubank"),
        ({"name": "Conta Corrente", "marketingName": "Conta Inter"}, "MeuPluggy", "Inter"),
        ({"name": "Itaú Uniclass", "marketingName": None}, "Pluggy", "Itau"),
        ({"name": "BB Conta Fácil", "marketingName": "Ourocard"}, "Open Finance", "Banco do Brasil"),
        ({"name": "Cartão", "marketingName": None}, "Bradesco", "Bradesco"),  # conector real vale
        ({"name": "Conta", "marketingName": None}, "MeuPluggy", "Banco"),  # sem pista
        (
            {"name": "Internacional Ltda", "marketingName": None},
            "MeuPluggy",
            "Banco",
        ),  # "inter" dentro de palavra
    ],
)
def test_inferir_banco(conta, conector, esperado):
    assert inferir_banco(conta, conector) == esperado


def test_hint_prefere_marketing_depois_bandeira_depois_final_da_conta():
    assert montar_hint({"marketingName": "Conta Inter", "number": "0001/12345-6"}) == "Conta Inter"
    assert montar_hint({"creditData": {"brand": "MASTERCARD", "level": "BLACK"}}) == "Mastercard Black"
    assert montar_hint({"number": "0001/12345-6"}) == "final 45-6".replace("final 45-6", "final 3456")
    assert montar_hint({"number": "12"}) is None
    assert "12345" not in (montar_hint({"number": "0001/12345-6"}) or "")


class _ClienteFalso:
    """Duck type de PluggyClient: so o que o sync chama."""

    def __init__(self, conector, contas):
        self._conector, self._contas = conector, contas

    def item(self, _):
        return {"status": "UPDATED", "connector": {"name": self._conector}}

    def accounts(self, _):
        return self._contas

    def bills(self, _):
        return []

    def transactions(self, *_):
        return iter(())


def test_sync_infere_banco_e_respeita_conta_renomeada(sessao):
    contas = [
        {
            "id": "acc-1",
            "type": "BANK",
            "subtype": "CHECKING_ACCOUNT",
            "name": "NuConta",
            "number": "0001/98765-4",
        },
        {
            "id": "acc-2",
            "type": "CREDIT",
            "subtype": "CREDIT_CARD",
            "name": "Cartão",
            "creditData": {"brand": "VISA"},
        },
    ]
    sincronizar(sessao, _ClienteFalso("MeuPluggy", contas), [ITEM], date(2026, 9, 1))
    por_ext = {a.external_id: a for a in sessao.scalars(select(Account))}
    assert por_ext["acc-1"].bank == "Nubank" and por_ext["acc-1"].hint == "final 7654"
    assert por_ext["acc-1"].pluggy_item_id == ITEM
    assert por_ext["acc-2"].bank == "Banco" and por_ext["acc-2"].hint == "Visa"

    por_ext["acc-2"].bank, por_ext["acc-2"].name, por_ext["acc-2"].user_named = "Itau", "Meu cartao", True
    sessao.commit()
    sincronizar(sessao, _ClienteFalso("MeuPluggy", contas), [ITEM], date(2026, 9, 1))
    a2 = sessao.scalar(select(Account).where(Account.external_id == "acc-2"))
    assert (a2.bank, a2.name) == ("Itau", "Meu cartao")  # inferencia nao sobrescreve escolha do usuario


@pytest.fixture
def http():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    with sessionmaker(bind=eng, expire_on_commit=False)() as s:
        s.add(PluggyItem(item_id=ITEM, connector_name="MeuPluggy", status="UPDATED"))
        s.add(
            Account(
                source="pluggy",
                bank="Banco",
                type="checking",
                name="Conta",
                external_id="x1",
                pluggy_item_id=ITEM,
                hint="final 1234",
            )
        )
        s.commit()
        app.dependency_overrides[get_session] = lambda: s
        yield TestClient(app)
        app.dependency_overrides.clear()


def test_put_conta_e_itens_com_contas_sem_identificadores(http):
    itens = http.get("/pluggy/items")
    assert itens.status_code == 200
    assert ITEM not in itens.text and "owner" not in itens.text
    contas = itens.json()[0]["accounts"]
    assert contas[0]["bank"] == "Banco" and contas[0]["hint"] == "final 1234"

    r = http.put(f"/accounts/{contas[0]['id']}", json={"bank": "Nubank"})
    assert r.status_code == 200 and r.json()["bank"] == "Nubank" and r.json()["name"] == "Conta"
    assert http.get("/pluggy/items").json()[0]["accounts"][0]["bank"] == "Nubank"
    assert http.put("/accounts/999", json={"bank": "X"}).status_code == 404
    assert http.put(f"/accounts/{contas[0]['id']}", json={"bank": ""}).status_code == 422


def test_garantir_colunas_em_banco_antigo():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with eng.begin() as c:  # schema antigo, sem as colunas novas
        c.execute(
            text(
                "CREATE TABLE accounts (id INTEGER PRIMARY KEY, source VARCHAR, bank VARCHAR, type VARCHAR, name VARCHAR, external_id VARCHAR, last_sync_at DATETIME)"  # noqa: E501
            )
        )
        c.execute(
            text("INSERT INTO accounts (source, bank, type, name) VALUES ('ofx', 'B', 'checking', 'C')")
        )
    Base.metadata.create_all(eng)
    garantir_colunas(eng)
    garantir_colunas(eng)  # idempotente
    with sessionmaker(bind=eng)() as s:
        a = s.scalar(select(Account))
        assert a.hint is None and a.pluggy_item_id is None and a.user_named in (False, 0)
