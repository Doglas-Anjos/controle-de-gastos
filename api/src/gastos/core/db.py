"""Sessao SQLAlchemy sobre SQLite local. Um engine por processo; testes trocam a URL por memoria."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from gastos.core.config import settings


class Base(DeclarativeBase):
    pass


def criar_engine(url: str | None = None):
    engine = create_engine(url or settings.db_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _pragmas(conn, _):
        # chaves estrangeiras sao opcionais no SQLite; o modelo depende delas para overrides e regras
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")

    return engine


engine = criar_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def criar_tabelas(eng=None) -> None:
    from gastos.domain import models  # noqa: F401  registra os modelos no metadata

    Base.metadata.create_all(eng or engine)
    garantir_colunas(eng or engine)


def garantir_colunas(eng) -> None:
    """create_all nao altera tabela existente. Sem Alembic (projeto pessoal, SQLite), colunas novas em
    tabelas ja populadas entram por ALTER TABLE quando faltam; e idempotente e barato."""
    from sqlalchemy import inspect, text

    insp = inspect(eng)
    for tabela in Base.metadata.sorted_tables:
        if not insp.has_table(tabela.name):
            continue
        existentes = {c["name"] for c in insp.get_columns(tabela.name)}
        with eng.begin() as conn:
            for col in tabela.columns:
                if col.name in existentes:
                    continue
                tipo = col.type.compile(eng.dialect)
                default = ""
                if (
                    col.default is not None
                    and getattr(col.default, "arg", None) is not None
                    and not callable(col.default.arg)
                ):
                    v = col.default.arg
                    default = f" DEFAULT {int(v) if isinstance(v, bool) else repr(v)}"
                conn.execute(text(f'ALTER TABLE {tabela.name} ADD COLUMN "{col.name}" {tipo}{default}'))


def get_session() -> Iterator[Session]:
    with SessionLocal() as sessao:
        yield sessao
