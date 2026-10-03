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


def test_transactions_v2_segue_cursor_next(httpx_mock, client):
    _auth(httpx_mock)
    httpx_mock.add_response(
        url=re.compile(rf"{BASE}/v2/transactions\?(?!.*after=)"),
        json={"results": [{"id": "a"}], "next": "?accountId=acc&after=c2"},
        is_reusable=True,
    )
    httpx_mock.add_response(
        url=f"{BASE}/v2/transactions?accountId=acc&after=c2",
        json={"results": [{"id": "b"}], "next": None},
        is_reusable=True,
    )
    out = list(client.transactions("acc", date(2026, 1, 1), date(2026, 6, 1)))
    assert [t["id"] for t in out] == ["a", "b"]
    trans = [r for r in httpx_mock.get_requests() if r.url.path == "/v2/transactions"]
    assert len(trans) == 2
    assert trans[0].url.params["dateFrom"] == "2026-01-01" and trans[0].url.params["dateTo"] == "2026-06-01"
    assert trans[1].url.params["after"] == "c2" and "dateFrom" not in trans[1].url.params


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
