"""Cliente minimo da API Pluggy. A apiKey dura 2h; renovamos aos 110 min ou sob 401.

PluggyError carrega so status e rotulo do endpoint: nunca headers, body ou URL com parametros,
porque qualquer um deles pode conter credencial ou item id.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from datetime import date, timedelta

import httpx

_VALIDADE_S = 110 * 60
_JANELA_DIAS = 90


class PluggyError(Exception):
    def __init__(self, status: int, mensagem: str):
        super().__init__(f"Pluggy HTTP {status}: {mensagem}")
        self.status = status


class PluggyClient:
    def __init__(self, base_url: str, client_id: str, client_secret: str):
        self._http = httpx.Client(base_url=base_url.rstrip("/"), timeout=30)
        self._cred = {"clientId": client_id, "clientSecret": client_secret}
        self._key: str | None = None
        self._key_em = 0.0

    def close(self) -> None:
        self._http.close()

    def _enviar(self, metodo: str, caminho: str, rotulo: str, **kw) -> httpx.Response:
        try:
            r = self._http.request(metodo, caminho, **kw)
        except httpx.HTTPError as e:
            raise PluggyError(0, f"falha de rede em {rotulo} ({type(e).__name__})") from None
        return r

    def _apikey(self, renovar: bool = False) -> str:
        if renovar or not self._key or time.monotonic() - self._key_em > _VALIDADE_S:
            r = self._enviar("POST", "/auth", "/auth", json=self._cred)
            if r.status_code != 200:
                raise PluggyError(r.status_code, "autenticacao recusada em /auth")
            self._key, self._key_em = r.json()["apiKey"], time.monotonic()
        return self._key

    def _get(self, caminho: str, rotulo: str, params: dict | None = None, metodo: str = "GET", **kw) -> dict:
        for tentativa in (0, 1):
            r = self._enviar(
                metodo,
                caminho,
                rotulo,
                params=params,
                headers={"X-API-KEY": self._apikey(tentativa == 1)},
                **kw,
            )
            if r.status_code != 401 or tentativa:
                break
        if r.status_code >= 400:
            raise PluggyError(r.status_code, f"erro em {rotulo}")
        return r.json()

    def connect_token(self, client_user_id: str | None = None, item_id: str | None = None) -> str:
        """Token curto para o widget. Com item_id o widget abre em modo de atualizacao de conexao."""
        corpo: dict = {"options": {"clientUserId": client_user_id}} if client_user_id else {}
        if item_id:
            corpo["itemId"] = item_id
        return self._get("/connect_token", "/connect_token", metodo="POST", json=corpo)["accessToken"]

    def item(self, item_id: str) -> dict:
        return self._get(f"/items/{item_id}", "/items/{id}")

    def accounts(self, item_id: str) -> list[dict]:
        return self._get("/accounts", "/accounts", {"itemId": item_id})["results"]

    def transactions(self, account_id: str, from_: date, to: date, page_size: int = 500) -> Iterator[dict]:
        """A API limita a janela a 90 dias por chamada; fatiamos aqui para o chamador nao se preocupar."""
        ini = from_
        while ini <= to:
            fim = min(ini + timedelta(days=_JANELA_DIAS - 1), to)
            pagina = 1
            while True:
                d = self._get(
                    "/transactions",
                    "/transactions",
                    {
                        "accountId": account_id,
                        "from": ini.isoformat(),
                        "to": fim.isoformat(),
                        "page": pagina,
                        "pageSize": page_size,
                    },
                )
                yield from d["results"]
                if pagina >= d.get("totalPages", 1):
                    break
                pagina += 1
            ini = fim + timedelta(days=1)

    def bills(self, account_id: str) -> list[dict]:
        return self._get("/bills", "/bills", {"accountId": account_id})["results"]

    def categories(self) -> list[dict]:
        return self._get("/categories", "/categories")["results"]
