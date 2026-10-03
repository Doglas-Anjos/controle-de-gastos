"""Ajuste manual por transacao (categoria ou exclusao). Vive fora de transactions para sobreviver ao sync."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from gastos.api.schemas import OverrideIn
from gastos.core.db import get_session
from gastos.domain.models import Category, Transaction, TransactionOverride

router = APIRouter()


@router.put("/transactions/{transaction_id}/override", response_model=OverrideIn)
def definir(transaction_id: int, dados: OverrideIn, sessao: Session = Depends(get_session)):
    if sessao.get(Transaction, transaction_id) is None:
        raise HTTPException(404, "transacao nao encontrada")
    if dados.category_id is not None and sessao.get(Category, dados.category_id) is None:
        raise HTTPException(404, "categoria nao encontrada")
    o = sessao.get(TransactionOverride, transaction_id) or TransactionOverride(transaction_id=transaction_id)
    o.category_id, o.exclude, o.note = dados.category_id, dados.exclude, dados.note
    sessao.add(o)
    sessao.commit()
    return dados


@router.delete("/transactions/{transaction_id}/override", status_code=204)
def remover(transaction_id: int, sessao: Session = Depends(get_session)):
    o = sessao.get(TransactionOverride, transaction_id)
    if o is not None:
        sessao.delete(o)
        sessao.commit()
    return Response(status_code=204)
