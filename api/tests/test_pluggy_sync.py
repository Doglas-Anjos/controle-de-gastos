import json
import re
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from gastos.domain.models import Account, Transaction, TransactionOverride
from gastos.ingest.pluggy_client import PluggyClient
from gastos.ingest.pluggy_sync import reprocessar_pluggy, sincronizar

BASE = "https://pluggy.test"
FIX = Path(__file__).parent / "fixtures" / "pluggy"
ITEM = "00000000-0000-4000-8000-000000000001"
BANCO = "00000000-0000-4000-8000-000000000002"
CARTAO = "00000000-0000-4000-8000-000000000003"


def _j(nome):
    return json.loads((FIX / nome).read_text(encoding="utf-8"))


@pytest.fixture
def client():
    c = PluggyClient(BASE, "id", "segredo")
    yield c
    c.close()


def _mock(httpx_mock, cartao=None):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "k"}, is_reusable=True)
    httpx_mock.add_response(url=re.compile(rf"{BASE}/items/"), json=_j("item.json"), is_reusable=True)
    httpx_mock.add_response(url=re.compile(rf"{BASE}/accounts"), json=_j("accounts.json"), is_reusable=True)
    httpx_mock.add_response(url=re.compile(rf"{BASE}/bills"), json=_j("bills.json"), is_reusable=True)
    # v2: primeira pagina sem `after`; a segunda e chamada com a query string devolvida em `next`
    httpx_mock.add_response(
        url=re.compile(rf"{BASE}/v2/transactions\?(?!.*after=).*{BANCO}"),
        json=_j("transactions_page1.json"),
        is_reusable=True,
    )
    httpx_mock.add_response(
        url=re.compile(rf"{BASE}/v2/transactions\?accountId={BANCO}&after=cursor-pagina-2"),
        json=_j("transactions_page2.json"),
        is_reusable=True,
    )
    httpx_mock.add_response(
        url=re.compile(rf"{BASE}/v2/transactions\?.*{CARTAO}"),
        json=cartao or {"results": [], "next": None},
        is_reusable=True,
    )


def test_sync_completo_e_idempotente(sessao, client, httpx_mock):
    _mock(httpx_mock)
    r = sincronizar(sessao, client, [ITEM], date.today() - timedelta(days=30))
    assert r == {"items": 1, "accounts": 2, "transactions_new": 3, "transactions_updated": 0, "errors": []}

    contas = {c.type: c for c in sessao.scalars(select(Account))}
    assert set(contas) == {"checking", "credit"} and contas["checking"].last_sync_at is not None
    t = sessao.scalar(select(Transaction).where(Transaction.status == "PENDING"))
    assert (t.installment_n, t.installment_total) == (3, 12)
    assert t.raw_json["id"].endswith("13")

    sessao.add(TransactionOverride(transaction_id=t.id, note="meu"))
    sessao.commit()
    r = sincronizar(sessao, client, [ITEM], None)  # agora usa last_sync_at - 7 dias
    assert (r["transactions_new"], r["transactions_updated"]) == (0, 3)
    assert sessao.get(TransactionOverride, t.id).note == "meu"


def test_janela_padrao_primeiro_sync_90_dias(sessao, client, httpx_mock):
    _mock(httpx_mock)
    sincronizar(sessao, client, [ITEM], None)
    de = min(
        r.url.params["dateFrom"]
        for r in httpx_mock.get_requests()
        if r.url.path == "/v2/transactions" and "dateFrom" in r.url.params  # paginas via `next` nao repetem
    )
    assert de == (date.today() - timedelta(days=90)).isoformat()


def test_cartao_mapeia_fatura(sessao, client, httpx_mock):
    pag = _j("transactions_page2.json")
    pag["results"][0]["accountId"] = CARTAO
    pag["next"] = None
    pag["results"][0]["id"] = "00000000-0000-4000-8000-000000000014"
    _mock(httpx_mock, cartao=pag)
    sincronizar(sessao, client, [ITEM], date.today() - timedelta(days=10))
    assert (
        sessao.scalar(
            select(Transaction.bill_month).where(
                Transaction.installment_n == 3, Transaction.account.has(type="credit")
            )
        )
        == "2026-10"
    )


def test_item_com_login_error_vira_erro_e_nao_derruba(sessao, client, httpx_mock):
    ruim = "00000000-0000-4000-8000-0000000000ff"
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "k"}, is_reusable=True)
    httpx_mock.add_response(url=f"{BASE}/items/{ruim}", json={"status": "LOGIN_ERROR"})
    httpx_mock.add_response(url=f"{BASE}/items/{ITEM}", status_code=404)
    r = sincronizar(sessao, client, [ruim, ITEM], None)
    assert r["items"] == 0 and len(r["errors"]) == 2
    assert "LOGIN_ERROR" in r["errors"][0] and ruim not in " ".join(r["errors"])


def test_cartao_inverte_sinal_e_marca_pagamento_de_fatura(sessao, client, httpx_mock):
    # No cartao a API manda compra (DEBIT) positiva e pagamento da fatura (CREDIT) negativo
    pag = _j("transactions_page2.json")
    compra = {**pag["results"][0], "accountId": CARTAO, "amount": 39.9}
    compra["id"] = "00000000-0000-4000-8000-000000000014"
    fatura = {
        **compra,
        "id": "00000000-0000-4000-8000-000000000015",
        "amount": -300.0,
        "type": "CREDIT",
        "operationType": "PAGAMENTO_FATURA",
        "category": "Transfers",
        "creditCardMetadata": None,
    }
    dolar = {
        **compra,
        "id": "00000000-0000-4000-8000-000000000016",
        "amount": 24.52,
        "currencyCode": "USD",
        "amountInAccountCurrency": 131.07,
        "creditCardMetadata": None,
    }
    _mock(httpx_mock, cartao={"results": [compra, fatura, dolar], "next": None})
    sincronizar(sessao, client, [ITEM], date.today() - timedelta(days=10))
    no_cartao = sessao.scalars(select(Transaction).where(Transaction.account.has(type="credit")))
    txs = {t.external_id[-2:]: t for t in no_cartao}
    assert txs["14"].amount == -39.9 and txs["14"].type == "DEBIT"
    assert txs["15"].amount == 300.0 and txs["15"].pluggy_category == "Credit card payment"
    assert txs["16"].amount == -131.07  # compra em dolar entra pelo valor em reais
    # conta corrente mantem o sinal que veio
    assert sessao.scalar(select(Transaction.amount).where(Transaction.account.has(type="checking"))) < 0


def test_reprocessar_corrige_sinal_de_sync_antigo(sessao):
    conta = Account(source="pluggy", bank="Banco Exemplo", type="credit", name="Cartao", external_id="c1")
    sessao.add(conta)
    sessao.flush()
    raw = {"id": "t1", "amount": 50.0, "type": "DEBIT", "date": "2026-09-01T00:00:00.000Z"}
    sessao.add(
        Transaction(
            account_id=conta.id,
            external_id="t1",
            date=date(2026, 9, 1),
            description="LOJA",
            description_norm="loja",
            amount=50.0,
            type="DEBIT",
            raw_json=raw,
        )
    )
    sessao.commit()
    assert reprocessar_pluggy(sessao) == 1
    assert sessao.scalar(select(Transaction.amount)) == -50.0
    assert reprocessar_pluggy(sessao) == 0  # idempotente
