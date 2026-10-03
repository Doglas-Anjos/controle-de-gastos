"""Contas conhecidas (Pluggy, OFX, CSV)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.api.schemas import AccountOut
from gastos.core.db import get_session
from gastos.domain.models import Account

router = APIRouter()


@router.get("/accounts", response_model=list[AccountOut])
def listar_contas(sessao: Session = Depends(get_session)):
    return [
        AccountOut.model_validate(a, from_attributes=True)
        for a in sessao.scalars(select(Account).order_by(Account.id))
    ]
