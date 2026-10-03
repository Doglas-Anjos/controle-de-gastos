import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from gastos.api.main import app
from gastos.core.config import settings
from gastos.core.db import Base, get_session
from gastos.domain.models import PluggyItem
from gastos.ingest.pluggy_client import PluggyClient
from gastos.ingest.pluggy_sync import itens_para_sync, sincronizar

BASE = "https://pluggy.test"
ITEM = "00000000-0000-4000-8000-000000000001"
ITEM_ENV = "00000000-0000-4000-8000-0000000000e1"
FIX = Path(__file__).parent / "fixtures" / "pluggy"


@pytest.fixture
def sessao():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    with sessionmaker(bind=eng, expire_on_commit=False)() as s:
        yield s


@pytest.fixture
def http(sessao):
    app.dependency_overrides[get_session] = lambda: sessao
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def cred(monkeypatch):
    monkeypatch.setattr(settings, "pluggy_client_id", "id-ficticio")
    monkeypatch.setattr(settings, "pluggy_client_secret", "segredo-ficticio")
    monkeypatch.setattr(settings, "pluggy_base_url", BASE)
    monkeypatch.setattr(settings, "pluggy_item_ids", "")


def _sem_cred(monkeypatch):
    monkeypatch.setattr(settings, "pluggy_client_id", "")
    monkeypatch.setattr(settings, "pluggy_item_ids", "")


def test_connect_token_sem_credenciais_409(http, monkeypatch):
    _sem_cred(monkeypatch)
    assert http.post("/pluggy/connect-token").status_code == 409


def test_connect_token_chama_auth_e_token(http, cred, httpx_mock):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "k"})
    httpx_mock.add_response(method="POST", url=f"{BASE}/connect_token", json={"accessToken": "jwt-curto"})
    r = http.post("/pluggy/connect-token")
    assert r.status_code == 200 and r.json() == {"access_token": "jwt-curto"}
    req = httpx_mock.get_requests()[-1]
    assert req.headers["X-API-KEY"] == "k" and json.loads(req.content) == {}


def test_connect_token_atualizacao_envia_item_id(http, cred, httpx_mock):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "k"})
    httpx_mock.add_response(method="POST", url=f"{BASE}/connect_token", json={"accessToken": "t"})
    assert http.post("/pluggy/connect-token", json={"item_id": ITEM}).status_code == 200
    assert json.loads(httpx_mock.get_requests()[-1].content) == {"itemId": ITEM}


def test_client_user_id_vai_em_options(httpx_mock):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "k"})
    httpx_mock.add_response(method="POST", url=f"{BASE}/connect_token", json={"accessToken": "t"})
    c = PluggyClient(BASE, "id", "segredo")
    assert c.connect_token(client_user_id="u1") == "t"
    c.close()
    assert json.loads(httpx_mock.get_requests()[-1].content) == {"options": {"clientUserId": "u1"}}


def _mock_item(httpx_mock):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "k"}, is_reusable=True)
    item = json.loads((FIX / "item.json").read_text(encoding="utf-8"))
    httpx_mock.add_response(url=re.compile(rf"{BASE}/items/"), json=item, is_reusable=True)
    httpx_mock.add_response(url=re.compile(rf"{BASE}/accounts"), json={"results": []}, is_reusable=True)


def test_post_item_salva_sincroniza_e_e_idempotente(http, sessao, cred, httpx_mock):
    _mock_item(httpx_mock)
    r = http.post("/pluggy/items", json={"item_id": ITEM, "connector_name": "Nubank"})
    assert r.status_code == 200 and ITEM not in r.text
    assert r.json()["status"] == "UPDATED" and r.json()["connector_name"] == "Banco Exemplo"
    assert r.json()["source"] == "widget"
    assert http.post("/pluggy/items", json={"item_id": ITEM}).json()["id"] == r.json()["id"]
    assert sessao.query(PluggyItem).count() == 1


def test_post_item_erro_do_pluggy_vira_status_erro(http, cred, httpx_mock):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "k"}, is_reusable=True)
    httpx_mock.add_response(url=re.compile(rf"{BASE}/items/"), status_code=500, is_reusable=True)
    r = http.post("/pluggy/items", json={"item_id": ITEM})
    assert r.status_code == 200 and r.json()["status"] == "ERRO" and ITEM not in r.text


def test_erro_de_sync_nunca_contem_item_id(sessao, httpx_mock):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "k"})
    httpx_mock.add_response(url=re.compile(rf"{BASE}/items/"), status_code=404)
    c = PluggyClient(BASE, "id", "segredo")
    r = sincronizar(sessao, c, [ITEM], None)
    c.close()
    assert r["errors"] and all(ITEM not in e for e in r["errors"])


def test_get_lista_env_e_widget_sem_item_id(http, sessao, monkeypatch):
    monkeypatch.setattr(settings, "pluggy_item_ids", f"{ITEM_ENV},outro-item-env")
    sessao.add(PluggyItem(item_id=ITEM, connector_name="Inter"))
    sessao.commit()
    r = http.get("/pluggy/items")
    assert "item_id" not in r.text and ITEM not in r.text and ITEM_ENV not in r.text
    assert [(i["id"], i["source"]) for i in r.json()] == [(1, "widget"), (-1, "env"), (-2, "env")]
    assert r.json()[1]["connector_name"] is None


def test_delete_widget_204_e_env_404(http, sessao, monkeypatch):
    monkeypatch.setattr(settings, "pluggy_item_ids", ITEM_ENV)
    sessao.add(PluggyItem(item_id=ITEM))
    sessao.commit()
    assert http.delete("/pluggy/items/-1").status_code == 404
    assert http.delete("/pluggy/items/1").status_code == 204
    assert http.delete("/pluggy/items/1").status_code == 404


def test_health_reflete_credenciais_e_itens(http, sessao, cred):
    assert http.get("/health").json() == {
        "ok": True,
        "pluggy": False,
        "pluggy_credenciais": True,
        "openai": settings.openai_configurado,
    }
    sessao.add(PluggyItem(item_id=ITEM))
    sessao.commit()
    j = http.get("/health").json()
    assert j["pluggy"] is True and j["pluggy_credenciais"] is True


def test_health_sem_credenciais(http, sessao, monkeypatch):
    _sem_cred(monkeypatch)
    sessao.add(PluggyItem(item_id=ITEM))
    sessao.commit()
    j = http.get("/health").json()
    assert j["pluggy"] is False and j["pluggy_credenciais"] is False


def test_itens_para_sync_une_sem_duplicar(sessao, monkeypatch):
    monkeypatch.setattr(settings, "pluggy_item_ids", f"{ITEM_ENV},{ITEM}")
    sessao.add_all([PluggyItem(item_id=ITEM), PluggyItem(item_id="widget-item-2")])
    sessao.commit()
    assert itens_para_sync(sessao) == [ITEM_ENV, ITEM, "widget-item-2"]


def test_sync_409_sem_itens(http, cred):
    assert http.post("/sync").status_code == 409
