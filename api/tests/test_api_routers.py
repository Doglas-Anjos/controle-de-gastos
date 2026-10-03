from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from gastos.api.main import app
from gastos.core.config import settings
from gastos.core.db import Base, get_session
from gastos.domain.models import Category

OFX = Path(__file__).parent / "fixtures" / "ofx" / "cartao.ofx"


@pytest.fixture
def sessao():
    # TestClient roda em outra thread: StaticPool mantem a mesma conexao em memoria
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    with sessionmaker(bind=eng, expire_on_commit=False)() as s:
        yield s


@pytest.fixture
def http(sessao):
    app.dependency_overrides[get_session] = lambda: sessao
    yield TestClient(app)  # sem "with": evita o lifespan, que criaria o banco real
    app.dependency_overrides.clear()


def _upload(http):
    with OFX.open("rb") as f:
        return http.post("/import/upload", files=[("files", ("cartao.ofx", f, "application/x-ofx"))])


def test_upload_ofx_e_listar_contas(http):
    r = _upload(http)
    assert r.status_code == 200
    assert r.json() == {
        "files": 1,
        "accounts_created": 1,
        "transactions_new": 9,
        "transactions_updated": 0,
        "errors": [],
    }
    assert _upload(http).json()["transactions_updated"] == 9
    contas = http.get("/accounts").json()
    assert len(contas) == 1 and contas[0]["type"] == "credit" and "external_id" not in contas[0]


def test_upload_invalido_vira_erro(http):
    r = http.post("/import/upload", files=[("files", ("x.txt", b"nada", "text/plain"))])
    assert r.status_code == 200 and r.json()["files"] == 0 and len(r.json()["errors"]) == 1


def test_regras(http, sessao):
    sessao.add(Category(name="Mercado", kind="variavel"))
    sessao.commit()
    nova = http.post("/rules", json={"pattern": "mercado", "category_id": 1})
    assert nova.status_code == 201
    rid = nova.json()["id"]
    assert http.get("/rules").json() == [{"pattern": "mercado", "category_id": 1, "priority": 100, "id": rid}]
    assert http.post("/rules", json={"pattern": "(", "category_id": 1}).status_code == 422
    assert http.post("/rules", json={"pattern": "x", "category_id": 99}).status_code == 404
    assert http.delete(f"/rules/{rid}").status_code == 204
    assert http.delete("/rules/999").status_code == 404
    assert http.get("/rules").json() == []


def test_override(http):
    _upload(http)
    assert http.put("/transactions/1/override", json={"exclude": True, "note": "n"}).json()["exclude"] is True
    assert http.put("/transactions/1/override", json={"exclude": False}).status_code == 200
    assert http.put("/transactions/999/override", json={}).status_code == 404
    assert http.delete("/transactions/1/override").status_code == 204
    assert http.delete("/transactions/1/override").status_code == 204


def test_sync_sem_credencial_409(http, monkeypatch):
    monkeypatch.setattr(settings, "pluggy_client_id", "")
    assert http.post("/sync").status_code == 409
