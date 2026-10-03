"""Configuracao lida do ambiente (.env na raiz do repo).

Tudo que e segredo ou especifico da maquina entra aqui e so aqui; nenhum outro modulo le os.environ.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=RAIZ / ".env", env_file_encoding="utf-8", extra="ignore")

    pluggy_client_id: str = ""
    pluggy_client_secret: str = ""
    pluggy_item_ids: str = ""
    pluggy_base_url: str = "https://api.pluggy.ai"

    openai_api_key: str = ""
    openai_model: str = "gpt-5-mini"
    insights_pseudonimizar: bool = False

    gastos_db_path: str = "data/gastos.db"
    cors_origins: str = "http://localhost:3000"

    @property
    def item_ids(self) -> list[str]:
        return [i.strip() for i in self.pluggy_item_ids.split(",") if i.strip()]

    @property
    def db_url(self) -> str:
        caminho = Path(self.gastos_db_path)
        if not caminho.is_absolute():
            caminho = RAIZ / caminho
        caminho.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{caminho.as_posix()}"

    @property
    def pluggy_credenciais(self) -> bool:
        """Basta para gerar connect token e abrir o widget; itens podem vir depois pelo banco."""
        return bool(self.pluggy_client_id and self.pluggy_client_secret)

    @property
    def pluggy_configurado(self) -> bool:
        """Credenciais + itens do .env. Itens do widget entram em ingest.pluggy_sync."""
        return self.pluggy_credenciais and bool(self.item_ids)

    @property
    def openai_configurado(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def extra_sensiveis(self) -> set[str]:
        """Valores que nunca podem aparecer em log ou payload externo; usado pelos testes de redacao."""
        return {
            v
            for v in (self.pluggy_client_id, self.pluggy_client_secret, self.openai_api_key, *self.item_ids)
            if v
        }


settings = Settings()
