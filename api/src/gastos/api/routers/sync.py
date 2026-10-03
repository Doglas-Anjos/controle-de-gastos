"""Disparo manual do sync Pluggy."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from gastos.api.schemas import SyncResult
from gastos.core.config import settings
from gastos.core.db import get_session
from gastos.domain.pipeline import recalcular
from gastos.ingest.pluggy_client import PluggyClient
from gastos.ingest.pluggy_sync import itens_para_sync, sincronizar

router = APIRouter()


@router.post("/sync", response_model=SyncResult)
def sync(desde: date | None = None, sessao: Session = Depends(get_session)):
    itens = itens_para_sync(sessao)
    if not settings.pluggy_credenciais or not itens:
        raise HTTPException(409, "Pluggy nao configurado: faltam credenciais ou nenhum banco conectado")
    client = PluggyClient(settings.pluggy_base_url, settings.pluggy_client_id, settings.pluggy_client_secret)
    try:
        r = sincronizar(sessao, client, itens, desde)
    finally:
        client.close()
    recalcular(sessao)
    return SyncResult(**r)
