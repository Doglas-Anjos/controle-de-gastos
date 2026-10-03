"""Regras de categoria do usuario (regex sobre a descricao)."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.api.schemas import RuleIn, RuleOut
from gastos.core.db import get_session
from gastos.domain.models import Category, CategoryRule

router = APIRouter()


def _out(r: CategoryRule) -> RuleOut:
    return RuleOut(id=r.id, pattern=r.pattern, category_id=r.category_id, priority=r.priority)


@router.get("/rules", response_model=list[RuleOut])
def listar(sessao: Session = Depends(get_session)):
    return [
        _out(r) for r in sessao.scalars(select(CategoryRule).order_by(CategoryRule.priority, CategoryRule.id))
    ]


@router.post("/rules", response_model=RuleOut, status_code=201)
def criar(regra: RuleIn, sessao: Session = Depends(get_session)):
    try:
        re.compile(regra.pattern)
    except re.error:
        raise HTTPException(422, "regex invalida") from None
    if sessao.get(Category, regra.category_id) is None:
        raise HTTPException(404, "categoria nao encontrada")
    r = CategoryRule(**regra.model_dump())
    sessao.add(r)
    sessao.commit()
    return _out(r)


@router.delete("/rules/{rule_id}", status_code=204)
def remover(rule_id: int, sessao: Session = Depends(get_session)):
    r = sessao.get(CategoryRule, rule_id)
    if r is None:
        raise HTTPException(404, "regra nao encontrada")
    sessao.delete(r)
    sessao.commit()
    return Response(status_code=204)
