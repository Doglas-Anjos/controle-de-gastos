"""Aplicacao FastAPI. Routers sao registrados aqui; cada router vive em gastos/api/<recurso>.py."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from gastos.core.config import settings
from gastos.core.db import criar_tabelas


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


@app.get("/health")
def health() -> dict:
    return {"ok": True, "pluggy": settings.pluggy_configurado, "openai": settings.openai_configurado}
