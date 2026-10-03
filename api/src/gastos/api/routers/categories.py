"""Categorias (semeadas na primeira leitura para a tela nunca ver lista vazia)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.api.schemas import CategoryOut
from gastos.core.db import get_session
from gastos.domain.models import Category
from gastos.domain.seed import semear_categorias

router = APIRouter()


@router.get("/categories", response_model=list[CategoryOut])
def listar(sessao: Session = Depends(get_session)):
    semear_categorias(sessao)
    return [
        CategoryOut.model_validate(c, from_attributes=True)
        for c in sessao.scalars(select(Category).order_by(Category.name))
    ]
