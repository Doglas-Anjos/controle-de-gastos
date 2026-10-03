"""Categorias: semeadas na primeira leitura (a tela nunca ve lista vazia); o usuario cria as suas,
inclusive subcategorias de um nivel, e apaga as que nao estao em uso."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gastos.api.schemas import CategoryIn, CategoryOut
from gastos.core.db import get_session
from gastos.domain.models import Category, CategoryRule, Forecast, Recurrence, TransactionOverride
from gastos.domain.seed import KINDS, SEM_CATEGORIA, semear_categorias

router = APIRouter()


@router.get("/categories", response_model=list[CategoryOut])
def listar(sessao: Session = Depends(get_session)):
    semear_categorias(sessao)
    return [
        CategoryOut.model_validate(c, from_attributes=True)
        for c in sessao.scalars(select(Category).order_by(Category.name))
    ]


@router.post("/categories", response_model=CategoryOut, status_code=201)
def criar(dados: CategoryIn, sessao: Session = Depends(get_session)):
    """Subcategoria herda o kind da mae: e o kind que decide se a transacao e gasto, receita ou
    transferencia, e uma filha com kind diferente da mae quebraria os totais agrupados."""
    nome = dados.name.strip()
    if sessao.scalar(select(Category).where(func.lower(Category.name) == nome.lower())):
        raise HTTPException(409, "ja existe uma categoria com esse nome")
    kind = dados.kind
    if dados.parent_id is not None:
        mae = sessao.get(Category, dados.parent_id)
        if mae is None:
            raise HTTPException(404, "categoria-mae nao encontrada")
        if mae.parent_id is not None:
            raise HTTPException(422, "subcategoria so tem um nivel")
        kind = mae.kind
    if kind not in KINDS:
        raise HTTPException(422, f"kind deve ser um de {sorted(KINDS)}")
    c = Category(name=nome, kind=kind, parent_id=dados.parent_id)
    sessao.add(c)
    sessao.commit()
    return CategoryOut.model_validate(c, from_attributes=True)


@router.delete("/categories/{category_id}", status_code=204)
def apagar(category_id: int, sessao: Session = Depends(get_session)):
    c = sessao.get(Category, category_id)
    if c is None:
        raise HTTPException(404, "categoria nao encontrada")
    if c.name == SEM_CATEGORIA:
        raise HTTPException(409, "Sem categoria e o destino de quem nao casa com nada; nao pode sair")
    em_uso = (
        sessao.scalar(select(Category.id).where(Category.parent_id == category_id))
        or sessao.scalar(select(CategoryRule.id).where(CategoryRule.category_id == category_id))
        or sessao.scalar(
            select(TransactionOverride.transaction_id).where(TransactionOverride.category_id == category_id)
        )
        or sessao.scalar(select(Recurrence.id).where(Recurrence.category_id == category_id))
    )
    if em_uso:
        raise HTTPException(
            409, "categoria em uso: mova antes as subcategorias, regras, transacoes e recorrencias"
        )
    for f in sessao.scalars(select(Forecast).where(Forecast.category_id == category_id)):
        sessao.delete(f)  # previsao e derivada; some junto e volta no proximo recalculo
    sessao.delete(c)
    sessao.commit()
    return Response(status_code=204)
