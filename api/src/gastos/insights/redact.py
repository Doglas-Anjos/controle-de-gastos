"""Monta o unico payload que sai da maquina para o LLM.

Recebe os dicts ja agregados (resumo mensal, recorrencias, previsao) e devolve um JSON pequeno so com o
que uma dica de economia precisa: totais por categoria e mes, comerciantes recorrentes e previsao.
Campos proibidos (ids externos, raw_json, conta, titular) nunca sao copiados; a verificacao final
`garantir_sem_sensiveis` falha alto se algum segredo conhecido aparecer no texto, para o teste de
vazamento ter o que pegar.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

CAMPOS_PROIBIDOS = {
    "raw_json",
    "external_id",
    "account_id",
    "item_id",
    "pluggy_account_id",
    "cpf",
    "titular",
    "agencia",
    "conta",
    "numero_cartao",
    "card_number",
    "client_id",
    "client_secret",
    "api_key",
}
_CPF = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)


def _pseudonimo(nome: str) -> str:
    """Rotulo estavel por comerciante (mesmo nome -> mesmo rotulo), para o LLM ainda agrupar."""
    return "comerciante-" + hashlib.sha1(nome.encode()).hexdigest()[:6]


LEGENDA = {
    "gasto_total_por_mes": "soma das saidas que contam como gasto (sem investimentos nem transferencias)",
    "receita_por_mes": "soma das entradas (salario, bolsa, rendimentos; sem resgates nem fatura paga)",
    "gasto_por_categoria": "categoria -> mes -> valor em BRL",
    "categorias": "categorias existentes; 'tipo' fixo/variavel = gasto, receita = entrada, "
    "transferencia = dinheiro entre contas do proprio usuario; 'dentro_de' = categoria-mae",
    "sem_categoria": "grupos de lancamentos ainda sem categoria: descricao normalizada (sem numeros), "
    "origem (conta corrente ou cartao), fluxo (entrada/saida), n lancamentos e total em BRL",
    "recorrencias": "cobrancas repetidas detectadas; tipo assinatura/parcela/detectada",
    "previsao": "estimativa dos proximos meses com faixa [p25, p75]",
}


def montar_resumo(
    resumo_mensal: dict[str, Any],
    recorrencias: list[dict[str, Any]],
    previsao: dict[str, Any],
    pseudonimizar: bool = False,
    categorias: list[dict[str, Any]] | None = None,
    pendentes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Reduz os agregados ao essencial e explica cada bloco numa legenda, para o modelo nao ter que
    adivinhar o que e gasto, entrada ou transferencia. Nomes de categoria sao publicos; nomes de
    comerciante (recorrencias e grupos sem categoria) sao os unicos dados potencialmente identificaveis
    e por isso tem a opcao de pseudonimo (que impede o modelo de catalogar, mas e a escolha do usuario)."""
    meses = resumo_mensal.get("months", [])
    por_categoria: dict[str, dict[str, float]] = {}
    for linha in resumo_mensal.get("by_category", []):
        cat = (linha.get("category") or {}).get("name") or "Sem categoria"
        por_categoria.setdefault(cat, {})[linha["month"]] = round(float(linha["total"]), 2)

    def nome(m: str) -> str:
        return _pseudonimo(m) if pseudonimizar else m

    rec = [
        {
            "comerciante": nome(r["merchant"]),
            "tipo": r["kind"],
            "periodicidade": r["periodicity"],
            "valor": round(float(r["expected_amount"]), 2),
            "categoria": (r.get("category") or {}).get("name"),
            "confianca": round(float(r.get("confidence", 0)), 2),
            "termina_em": r.get("ends_at"),
        }
        for r in recorrencias
        if r.get("active", True)
    ]
    prev = {
        "total_por_mes": {m: round(float(v), 2) for m, v in previsao.get("total_by_month", {}).items()},
        "por_categoria": [
            {
                "mes": ln["month"],
                "categoria": (ln.get("category") or {}).get("name") or "Sem categoria",
                "valor": round(float(ln["amount"]), 2),
                "faixa": [round(float(ln["low"]), 2), round(float(ln["high"]), 2)],
            }
            for ln in previsao.get("lines", [])
        ],
    }
    por_id = {c.get("id"): c.get("name") for c in categorias or []}
    cats = [
        {"nome": c["name"], "tipo": c["kind"], "dentro_de": por_id.get(c.get("parent_id"))}
        for c in categorias or []
    ]
    sem = [{**g, "descricao": nome(g["descricao"])} for g in pendentes or []]
    return {
        "moeda": "BRL",
        "legenda": LEGENDA,
        "meses": meses,
        "categorias": cats,
        "sem_categoria": sem,
        "gasto_total_por_mes": {
            m: round(float(v), 2) for m, v in resumo_mensal.get("total_by_month", {}).items()
        },
        "receita_por_mes": {
            m: round(float(v), 2) for m, v in resumo_mensal.get("income_by_month", {}).items()
        },
        "gasto_por_categoria": por_categoria,
        "recorrencias": rec,
        "previsao": prev,
    }


def garantir_sem_sensiveis(payload: dict[str, Any], segredos: set[str] = frozenset()) -> str:
    """Serializa e confere. Levanta ValueError em vez de filtrar em silencio: filtrar esconderia o bug
    que deixou o dado chegar ate aqui."""
    texto = json.dumps(payload, ensure_ascii=False, default=str)
    chaves = set(_todas_chaves(payload))
    proibidas = chaves & CAMPOS_PROIBIDOS
    if proibidas:
        raise ValueError(f"payload para o LLM contem campos proibidos: {sorted(proibidas)}")
    if _CPF.search(texto) or _UUID.search(texto):
        raise ValueError("payload para o LLM contem CPF ou UUID")
    for s in segredos:
        if s and s in texto:
            raise ValueError("payload para o LLM contem um segredo de configuracao")
    return texto


def _todas_chaves(obj: Any):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield str(k).lower()
            yield from _todas_chaves(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _todas_chaves(v)


def hash_payload(texto: str) -> str:
    return hashlib.sha256(texto.encode()).hexdigest()
