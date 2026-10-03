"""Contas conhecidas (Pluggy, OFX, CSV)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.api.schemas import AccountOut, AccountUpdate
from gastos.core.db import get_session
from gastos.domain.models import Account

router = APIRouter()


@router.get("/accounts", response_model=list[AccountOut])
def listar_contas(sessao: Session = Depends(get_session)):
    return [
        AccountOut.model_validate(a, from_attributes=True)
        for a in sessao.scalars(select(Account).order_by(Account.id))
    ]


@router.put("/accounts/{account_id}", response_model=AccountOut)
def renomear(account_id: int, dados: AccountUpdate, sessao: Session = Depends(get_session)):
    """Banco/nome escolhidos pelo usuario valem mais que a inferencia do sync (user_named)."""
    conta = sessao.get(Account, account_id)
    if conta is None:
        raise HTTPException(404, "conta nao encontrada")
    if dados.bank:
        conta.bank = dados.bank.strip()
    if dados.name:
        conta.name = dados.name.strip()
    conta.user_named = True
    sessao.commit()
    return AccountOut.model_validate(conta, from_attributes=True)
