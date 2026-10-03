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


def get_session() -> Iterator[Session]:
    with SessionLocal() as sessao:
        yield sessao
