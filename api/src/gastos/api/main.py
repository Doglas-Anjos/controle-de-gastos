"""Aplicacao FastAPI. Routers sao registrados aqui; cada router vive em gastos/api/<recurso>.py."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.api.schemas import HealthOut
from gastos.core.config import settings
from gastos.core.db import criar_tabelas, get_session
from gastos.domain.models import PluggyItem


@asynccontextmanager
async def _lifespan(_: FastAPI):
    criar_tabelas()
    yield


app = FastAPI(title="Controle de Gastos", version="0.1.0", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthOut)
def health(sessao: Session = Depends(get_session)):
    itens = bool(settings.item_ids) or sessao.scalar(select(PluggyItem.id).limit(1)) is not None
    return HealthOut(
        pluggy=settings.pluggy_credenciais and itens,
        pluggy_credenciais=settings.pluggy_credenciais,
        openai=settings.openai_configurado,
    )


from gastos.api.routers import (  # noqa: E402
    accounts,
    analytics,
    categories,
    imports,
    insights,
    overrides,
    pluggy,
    rules,
    sync,
    transactions,
)

for _r in (accounts, categories, transactions, analytics, insights, imports, sync, rules, overrides, pluggy):
    app.include_router(_r.router)
