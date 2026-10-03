import re
from datetime import date

import httpx
import pytest

from gastos.ingest.pluggy_client import PluggyClient, PluggyError

BASE = "https://pluggy.test"
SEGREDO = "segredo-ficticio-123"


@pytest.fixture
def client():
    c = PluggyClient(BASE, "id-ficticio", SEGREDO)
    yield c
    c.close()


def _auth(httpx_mock, **kw):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "k1"}, **kw)


def test_auth_uma_vez_e_header(httpx_mock, client):
    _auth(httpx_mock)
    httpx_mock.add_response(url=f"{BASE}/items/abc", json={"status": "UPDATED"}, is_reusable=True)
    client.item("abc")
    client.item("abc")
    reqs = httpx_mock.get_requests()
    assert [r.method for r in reqs].count("POST") == 1
    assert reqs[-1].headers["X-API-KEY"] == "k1"


def test_renova_sob_401(httpx_mock, client):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "velha"})
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", json={"apiKey": "nova"})
    httpx_mock.add_response(url=f"{BASE}/items/abc", status_code=401)
    httpx_mock.add_response(url=f"{BASE}/items/abc", json={"status": "UPDATED"})
    assert client.item("abc")["status"] == "UPDATED"
    assert httpx_mock.get_requests()[-1].headers["X-API-KEY"] == "nova"


def test_renova_apos_110_min(httpx_mock, client):
    _auth(httpx_mock, is_reusable=True)
    httpx_mock.add_response(url=f"{BASE}/items/abc", json={}, is_reusable=True)
    client.item("abc")
    client._key_em -= 111 * 60
    client.item("abc")
    assert [r.method for r in httpx_mock.get_requests()].count("POST") == 2


def test_transactions_pagina_e_fatia_em_90_dias(httpx_mock, client):
    _auth(httpx_mock)
    httpx_mock.add_response(
        url=re.compile(rf"{BASE}/transactions\?.*page=1"),
        json={"results": [{"id": "a"}], "page": 1, "totalPages": 2},
        is_reusable=True,
    )
    httpx_mock.add_response(
        url=re.compile(rf"{BASE}/transactions\?.*page=2"),
        json={"results": [{"id": "b"}], "page": 2, "totalPages": 2},
        is_reusable=True,
    )
    out = list(client.transactions("acc", date(2026, 1, 1), date(2026, 6, 1), page_size=50))
    assert len(out) == 4  # 152 dias = 2 janelas x 2 paginas x 1 item
    trans = [r for r in httpx_mock.get_requests() if "/transactions" in r.url.path]
    assert len(trans) == 4
    assert trans[0].url.params["from"] == "2026-01-01" and trans[0].url.params["to"] == "2026-03-31"
    assert trans[2].url.params["from"] == "2026-04-01" and trans[0].url.params["pageSize"] == "50"


def test_erro_nao_vaza_segredo(httpx_mock, client):
    _auth(httpx_mock)
    httpx_mock.add_response(url=f"{BASE}/items/abc", status_code=500, text=f"erro {SEGREDO}")
    with pytest.raises(PluggyError) as e:
        client.item("abc")
    assert e.value.status == 500
    assert SEGREDO not in str(e.value) and "k1" not in str(e.value)


def test_auth_recusada_nao_vaza_segredo(httpx_mock, client):
    httpx_mock.add_response(method="POST", url=f"{BASE}/auth", status_code=403, text=f"bad {SEGREDO}")
    with pytest.raises(PluggyError) as e:
        client.item("abc")
    assert SEGREDO not in str(e.value) and e.value.status == 403


def test_falha_de_rede_vira_pluggy_error(httpx_mock, client):
    httpx_mock.add_exception(httpx.ConnectError(f"boom {SEGREDO}"))
    with pytest.raises(PluggyError) as e:
        client.categories()
    assert SEGREDO not in str(e.value)
