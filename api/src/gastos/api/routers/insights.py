"""Dicas, perguntas e catalogacao pelo LLM. Tudo passa por redact.montar_resumo; esta e a unica saida
de dados da API. O modelo so propoe; /insights/aplicar grava o que o usuario aprovou."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.api.routers.analytics import previsao, recorrencias
from gastos.api.schemas import AnswerOut, ApplyIn, ApplyOut, CatalogOut, InsightsOut, QuestionIn
from gastos.core.config import settings
from gastos.core.db import get_session
from gastos.domain.catalogo import aplicar_acoes
from gastos.domain.models import Category
from gastos.domain.summary import grupos_sem_categoria, resumo_mensal
from gastos.insights.openai_client import InsightsIndisponivel, catalogar, gerar_dicas, responder
from gastos.insights.redact import montar_resumo

router = APIRouter()


def _payload(sessao: Session) -> dict:
    recs = [r.model_dump(mode="json") for r in recorrencias(active=True, sessao=sessao)]
    prev = previsao(horizon=3, sessao=sessao).model_dump(mode="json")
    cats = [
        {"id": c.id, "name": c.name, "kind": c.kind, "parent_id": c.parent_id}
        for c in sessao.scalars(select(Category).order_by(Category.name))
    ]
    return montar_resumo(
        resumo_mensal(sessao, 6),
        recs,
        prev,
        settings.insights_pseudonimizar,
        categorias=cats,
        pendentes=grupos_sem_categoria(sessao),
    )


@router.get("/insights", response_model=InsightsOut)
def dicas(forcar: bool = False, sessao: Session = Depends(get_session)):
    try:
        return InsightsOut(**gerar_dicas(sessao, _payload(sessao), forcar))
    except InsightsIndisponivel as e:
        raise HTTPException(409, str(e)) from e


@router.post("/insights/perguntar", response_model=AnswerOut)
def perguntar(dados: QuestionIn, sessao: Session = Depends(get_session)):
    try:
        return AnswerOut(**responder(sessao, _payload(sessao), dados.pergunta))
    except InsightsIndisponivel as e:
        raise HTTPException(409, str(e)) from e


@router.post("/insights/catalogar", response_model=CatalogOut)
def sugerir_categorias(forcar: bool = False, sessao: Session = Depends(get_session)):
    try:
        return CatalogOut(**catalogar(sessao, _payload(sessao), forcar))
    except InsightsIndisponivel as e:
        raise HTTPException(409, str(e)) from e


@router.post("/insights/aplicar", response_model=ApplyOut)
def aplicar(dados: ApplyIn, sessao: Session = Depends(get_session)):
    return ApplyOut(**aplicar_acoes(sessao, [a.model_dump() for a in dados.acoes]))
