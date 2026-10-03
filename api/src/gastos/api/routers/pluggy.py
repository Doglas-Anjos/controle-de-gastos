"""Conexao de bancos pelo widget Pluggy Connect. item_id e segredo: entra pelo POST, fica no banco
e nunca volta em resposta nem em mensagem de erro."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.api.schemas import ConnectTokenOut, PluggyItemIn, PluggyItemOut
from gastos.core.config import settings
from gastos.core.db import get_session
from gastos.domain.models import PluggyItem
from gastos.domain.pipeline import recalcular
from gastos.ingest.pluggy_client import PluggyClient, PluggyError
from gastos.ingest.pluggy_sync import sincronizar

router = APIRouter(prefix="/pluggy")


class _ConnectIn(BaseModel):
    item_id: str | None = None


def _client() -> PluggyClient:
    return PluggyClient(settings.pluggy_base_url, settings.pluggy_client_id, settings.pluggy_client_secret)


def _out(p: PluggyItem) -> PluggyItemOut:
    return PluggyItemOut(
        id=p.id,
        connector_name=p.connector_name,
        status=p.status,
        source="widget",
        created_at=p.created_at,
    )


@router.post("/connect-token", response_model=ConnectTokenOut)
def connect_token(corpo: _ConnectIn | None = Body(None)):
    if not settings.pluggy_credenciais:
        raise HTTPException(409, "Pluggy sem credenciais: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET")
    client = _client()
    try:
        return ConnectTokenOut(access_token=client.connect_token(item_id=corpo.item_id if corpo else None))
    except PluggyError as e:
        raise HTTPException(502, str(e)) from None  # PluggyError nunca carrega item id nem credencial
    finally:
        client.close()


@router.post("/items", response_model=PluggyItemOut)
def salvar_item(dados: PluggyItemIn, sessao: Session = Depends(get_session)):
    p = sessao.scalar(select(PluggyItem).where(PluggyItem.item_id == dados.item_id))
    if p is None:
        p = PluggyItem(item_id=dados.item_id)
        sessao.add(p)
    p.connector_name = dados.connector_name or p.connector_name
    sessao.commit()
    if settings.pluggy_credenciais:  # best effort: falha de Pluggy vira status ERRO, o item continua salvo
        client = _client()
        try:
            sincronizar(sessao, client, [p.item_id], None)
        finally:
            client.close()
        recalcular(sessao)
        sessao.refresh(p)
    return _out(p)


@router.get("/items", response_model=list[PluggyItemOut])
def listar_itens(sessao: Session = Depends(get_session)):
    doenv = [
        PluggyItemOut(id=-n, connector_name=None, status=None, source="env")
        for n, _ in enumerate(settings.item_ids, 1)
    ]
    return [*(_out(p) for p in sessao.scalars(select(PluggyItem).order_by(PluggyItem.id))), *doenv]


@router.delete("/items/{id}", status_code=204)
def remover_item(id: int, sessao: Session = Depends(get_session)):
    """Remove so a conexao; transacoes ja importadas ficam, como em todo re-sync."""
    p = sessao.get(PluggyItem, id) if id > 0 else None
    if p is None:
        raise HTTPException(404, "item nao encontrado")
    sessao.delete(p)
    sessao.commit()
    return Response(status_code=204)
