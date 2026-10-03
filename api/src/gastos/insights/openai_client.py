"""Chamada a OpenAI (Responses API com saida estruturada) e cache por hash do payload.

O cache existe por dois motivos: custo, e porque o payload so muda quando ha sync novo, entao a
mesma pergunta no mesmo dia deve devolver a mesma resposta sem gastar tokens.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.core.config import settings
from gastos.domain.models import Insight
from gastos.insights import prompts
from gastos.insights.redact import garantir_sem_sensiveis, hash_payload


class Dica(BaseModel):
    titulo: str
    categoria: str | None = None
    economia_estimada_mensal: float | None = None
    acao: str
    confianca: float = Field(ge=0, le=1)


class RelatorioDicas(BaseModel):
    resumo: str
    dicas: list[Dica]
    alertas: list[str]


class Acao(BaseModel):
    """Proposta do modelo. Todos os campos opcionais sao nulos quando nao se aplicam ao tipo; a
    validacao de verdade (categoria existe, kind valido) acontece em domain.catalogo ao aplicar."""

    tipo: Literal["criar_categoria", "categorizar"]
    nome: str | None
    kind: Literal["fixo", "variavel", "receita", "transferencia"] | None
    mae: str | None
    descricao: str | None
    categoria: str | None
    motivo: str | None
    confianca: float


class Resposta(BaseModel):
    resposta: str
    acoes: list[Acao] = []  # vazia na maioria das perguntas; so quando o usuario pede para organizar


class Catalogo(BaseModel):
    sugestoes: list[Acao]


class InsightsIndisponivel(RuntimeError):
    """OPENAI_API_KEY ausente. A rota converte em 409 com instrucao de configuracao."""


def _cliente():
    if not settings.openai_configurado:
        raise InsightsIndisponivel("defina OPENAI_API_KEY no .env para gerar dicas")
    from openai import OpenAI  # import tardio: o modulo e carregado mesmo sem chave configurada

    return OpenAI(api_key=settings.openai_api_key)


def _cache(sessao: Session, kind: str, chave: str, pergunta: str | None) -> Insight | None:
    stmt = select(Insight).where(Insight.input_hash == chave, Insight.kind == kind)
    if pergunta is not None:
        stmt = stmt.where(Insight.question == pergunta)
    return sessao.scalars(stmt.order_by(Insight.created_at.desc())).first()


def _chamar(instrucoes: str, texto: str, formato: type[BaseModel]) -> BaseModel:
    resposta = _cliente().responses.parse(
        model=settings.openai_model,
        instructions=instrucoes,
        input=texto,
        text_format=formato,
    )
    if resposta.output_parsed is None:
        raise RuntimeError("o modelo nao devolveu a estrutura esperada")
    return resposta.output_parsed


def gerar_dicas(sessao: Session, payload: dict[str, Any], forcar: bool = False) -> dict[str, Any]:
    texto = garantir_sem_sensiveis(payload, settings.extra_sensiveis)
    chave = hash_payload(texto)
    if not forcar and (c := _cache(sessao, "dicas", chave, None)):
        return {**c.response_json, "gerado_em": c.created_at, "cache": True}
    relatorio = _chamar(prompts.INSTRUCOES_DICAS, texto, RelatorioDicas).model_dump()
    sessao.add(Insight(input_hash=chave, kind="dicas", response_json=relatorio))
    sessao.commit()
    return {**relatorio, "gerado_em": datetime.utcnow(), "cache": False}


def catalogar(sessao: Session, payload: dict[str, Any], forcar: bool = False) -> dict[str, Any]:
    """Sugestoes de categoria para os grupos sem categoria do payload. So propostas: aplicar e outra
    rota, depois do usuario escolher."""
    texto = garantir_sem_sensiveis(payload, settings.extra_sensiveis)
    chave = hash_payload(texto)
    if not forcar and (c := _cache(sessao, "catalogo", chave, None)):
        return {**c.response_json, "gerado_em": c.created_at, "cache": True}
    if not payload.get("sem_categoria"):
        return {"sugestoes": [], "gerado_em": datetime.utcnow(), "cache": False}
    catalogo = _chamar(prompts.INSTRUCOES_CATALOGO, texto, Catalogo).model_dump()
    sessao.add(Insight(input_hash=chave, kind="catalogo", response_json=catalogo))
    sessao.commit()
    return {**catalogo, "gerado_em": datetime.utcnow(), "cache": False}


def responder(sessao: Session, payload: dict[str, Any], pergunta: str) -> dict[str, Any]:
    texto = garantir_sem_sensiveis(payload, settings.extra_sensiveis)
    chave = hash_payload(texto)
    if c := _cache(sessao, "pergunta", chave, pergunta):
        return {**c.response_json, "gerado_em": c.created_at}
    entrada = f"PERGUNTA: {pergunta}\n\nDADOS:\n{texto}"
    resposta = _chamar(prompts.INSTRUCOES_PERGUNTA, entrada, Resposta).model_dump()
    sessao.add(Insight(input_hash=chave, kind="pergunta", question=pergunta, response_json=resposta))
    sessao.commit()
    return {**resposta, "gerado_em": datetime.utcnow()}
