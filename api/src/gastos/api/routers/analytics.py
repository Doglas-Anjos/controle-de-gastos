"""Resumo mensal, recorrencias (com decisao do usuario), previsao e recalculo manual."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.api.schemas import (
    AccountOut,
    ForecastLine,
    ForecastOut,
    RecurrenceDecision,
    RecurrenceOut,
    SummaryOut,
)
from gastos.core.db import get_session
from gastos.domain.categorize import categoria_out
from gastos.domain.forecast import prever
from gastos.domain.models import Account, Category, Recurrence
from gastos.domain.pipeline import recalcular
from gastos.domain.summary import resumo_mensal

router = APIRouter()


@router.get("/summary", response_model=SummaryOut)
def resumo(months: int = Query(12, ge=1, le=60), sessao: Session = Depends(get_session)):
    return SummaryOut(**resumo_mensal(sessao, months))


def _recorrencia_out(r: Recurrence, contas: dict[int, Account], cats: dict[int, Category]) -> RecurrenceOut:
    return RecurrenceOut(
        id=r.id,
        merchant=r.merchant_norm,
        account=AccountOut.model_validate(contas[r.account_id], from_attributes=True),
        kind=r.kind,
        periodicity=r.periodicity,
        expected_amount=r.expected_amount,
        expected_day=r.expected_day,
        next_due=r.next_due,
        ends_at=r.ends_at,
        occurrences=r.occurrences,
        confidence=r.confidence,
        active=r.active,
        user_decision=r.user_decision,
        category=categoria_out(cats.get(r.category_id)),
    )


@router.get("/recurrences", response_model=list[RecurrenceOut])
def recorrencias(kind: str | None = None, active: bool | None = None, sessao: Session = Depends(get_session)):
    stmt = select(Recurrence)
    if kind:
        stmt = stmt.where(Recurrence.kind == kind)
    if active is not None:
        stmt = stmt.where(Recurrence.active.is_(active))
    contas = {a.id: a for a in sessao.scalars(select(Account))}
    cats = {c.id: c for c in sessao.scalars(select(Category))}
    recs = sorted(sessao.scalars(stmt), key=lambda r: (r.next_due or date.max, -r.expected_amount))
    return [_recorrencia_out(r, contas, cats) for r in recs]


@router.post("/recurrences/{recurrence_id}/decision", response_model=RecurrenceOut)
def decidir(recurrence_id: int, dados: RecurrenceDecision, sessao: Session = Depends(get_session)):
    r = sessao.get(Recurrence, recurrence_id)
    if r is None:
        raise HTTPException(404, "recorrencia nao encontrada")
    r.user_decision = dados.decision
    if dados.decision == "confirmada":
        r.active, r.confidence = True, 1.0
    else:
        r.active = False
    sessao.commit()
    prever(sessao, date.today())  # a parte fixa da previsao muda com a decisao
    contas = {a.id: a for a in sessao.scalars(select(Account))}
    cats = {c.id: c for c in sessao.scalars(select(Category))}
    return _recorrencia_out(r, contas, cats)


@router.get("/forecast", response_model=ForecastOut)
def previsao(horizon: int = Query(3, ge=1, le=12), sessao: Session = Depends(get_session)):
    linhas = prever(sessao, date.today(), horizon)
    total: dict[str, float] = {}
    for ln in linhas:
        total[ln["month"]] = round(total.get(ln["month"], 0.0) + ln["amount"], 2)
    return ForecastOut(
        horizon_months=horizon, lines=[ForecastLine(**ln) for ln in linhas], total_by_month=total
    )


@router.post("/recalculate")
def recalcular_tudo(sessao: Session = Depends(get_session)) -> dict[str, int]:
    return recalcular(sessao)
