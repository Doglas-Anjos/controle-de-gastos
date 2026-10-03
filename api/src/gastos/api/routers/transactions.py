"""Listagem paginada com categoria efetiva calculada na leitura (override > regra > pluggy)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from gastos.api.schemas import Page, TransactionOut
from gastos.core.db import get_session
from gastos.domain.categorize import categoria_out, categorias_efetivas
from gastos.domain.models import Transaction
from gastos.domain.recurrence import transacoes_recorrentes

router = APIRouter()


@router.get("/transactions", response_model=Page)
def listar(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    category_id: int | None = None,
    account_id: int | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sessao: Session = Depends(get_session),
):
    stmt = select(Transaction)
    if month:
        stmt = stmt.where(func.strftime("%Y-%m", Transaction.date) == month)
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    if q:
        padrao = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(Transaction.description_norm.like(padrao), func.lower(Transaction.description).like(padrao))
        )
    # filtro por categoria e feito em memoria: a categoria efetiva nao esta em coluna
    txs = list(sessao.scalars(stmt.order_by(Transaction.date.desc(), Transaction.id.desc())))
    efetivas = categorias_efetivas(sessao, txs)
    recorrentes = transacoes_recorrentes(sessao)
    if category_id is not None:
        txs = [t for t in txs if (efetivas[t.id][0] is not None and efetivas[t.id][0].id == category_id)]
    total = len(txs)
    fatia = txs[(page - 1) * page_size : page * page_size]
    items = []
    for t in fatia:
        cat, fonte, excluida = efetivas[t.id]
        items.append(
            TransactionOut(
                id=t.id,
                account_id=t.account_id,
                date=t.date,
                description=t.description,
                description_norm=t.description_norm,
                amount=t.amount,
                category=categoria_out(cat),
                category_source=fonte,
                excluded=excluida,
                installment=f"{t.installment_n}/{t.installment_total}" if t.installment_total else None,
                bill_month=t.bill_month,
                recurrence_id=recorrentes.get(t.id),
            )
        )
    return Page(items=items, total=total, page=page, page_size=page_size)
