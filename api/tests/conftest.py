"""Banco em memoria por teste. Nenhum teste toca data/ nem rede."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import sessionmaker

from gastos.core.db import Base, criar_engine
from gastos.domain import models  # noqa: F401


@pytest.fixture
def sessao():
    engine = criar_engine("sqlite://")
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as s:
        yield s
