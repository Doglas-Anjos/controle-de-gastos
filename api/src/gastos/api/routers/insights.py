"""Dicas e perguntas ao LLM. Tudo passa por redact.montar_resumo; esta e a unica saida de dados da API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from gastos.api.routers.analytics import previsao, recorrencias
from gastos.api.schemas import AnswerOut, InsightsOut, QuestionIn
from gastos.core.config import settings
from gastos.core.db import get_session
from gastos.domain.summary import resumo_mensal
from gastos.insights.openai_client import InsightsIndisponivel, gerar_dicas, responder
from gastos.insights.redact import montar_resumo

router = APIRouter()


def _payload(sessao: Session) -> dict:
    recs = [r.model_dump(mode="json") for r in recorrencias(active=True, sessao=sessao)]
    prev = previsao(horizon=3, sessao=sessao).model_dump(mode="json")
    return montar_resumo(resumo_mensal(sessao, 6), recs, prev, settings.insights_pseudonimizar)


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
