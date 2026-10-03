"""Categorias base, regras regex iniciais e mapeamento das categorias da Pluggy.

Tudo aqui e ponto de partida: o usuario edita regras e categorias depois, por isso a semeadura e
idempotente e nunca altera o que ja existe (nem o kind de uma categoria que o usuario mudou).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.domain.models import Category, CategoryRule
from gastos.domain.normalize import _sem_acento

SEM_CATEGORIA = "Sem categoria"

CATEGORIAS_BASE = {
    "Moradia": "fixo",
    "Contas e servicos": "fixo",
    "Assinaturas": "fixo",
    "Alimentacao": "variavel",
    "Mercado": "variavel",
    "Transporte": "variavel",
    "Saude": "variavel",
    "Educacao": "fixo",
    "Lazer": "variavel",
    "Compras": "variavel",
    "Viagem": "variavel",
    "Impostos e taxas": "fixo",
    "Investimentos": "transferencia",
    "Transferencia": "transferencia",
    "Receita": "receita",
    SEM_CATEGORIA: "variavel",
}

# Ordem = prioridade (menor vence). As especificas vem antes das genericas: "uber eats" antes de "uber",
# "mercado livre" antes de "mercado". \b evita casar pedaco de palavra ("tim" em "timbo", "raia" em "praia").
REGRAS_BASE = [
    (r"\b(?:uber ?eats|ifood|rappi|restaurante|lanchonete|padaria|pizzaria)\b", "Alimentacao"),
    (r"\b(?:netflix|spotify|prime video|disney|hbo|globoplay|youtube premium|deezer)\b", "Assinaturas"),
    (r"\b(?:mercado ?livre|amazon|shopee|aliexpress|magalu)\b", "Compras"),
    (r"\b(?:uber|99 ?pop|99app|posto|combustivel|shell|ipiranga)\b", "Transporte"),
    (r"\b(?:mercado|supermercado|atacad\w*|carrefour|assai|pao de acucar)\b", "Mercado"),
    (r"\b(?:farmacia|drogaria|drogasil|raia)\b", "Saude"),
    (
        r"\b(?:energia|luz|enel|cemig|copel|light|sabesp|sanepar|vivo|claro|tim|oi fibra|internet)\b",
        "Contas e servicos",
    ),
    (r"\b(?:aluguel|condominio|iptu)\b", "Moradia"),
    (r"\b(?:rendimento|salario|pagamento recebido)\b", "Receita"),
    (r"\b(?:aplicacao|resgate|tesouro|cdb)\b", "Investimentos"),
]

# Chaves sem acento e em minusculas (ver _chave). Inclui os nomes em ingles que a API devolve sem traducao.
_PLUGGY = {
    "Mercado": ["supermercado", "mercado", "groceries"],
    "Alimentacao": [
        "alimentacao",
        "restaurantes",
        "delivery de comida",
        "food and drinks",
        "eating out",
        "food delivery",
    ],
    "Transporte": [
        "transporte",
        "taxi e transporte privado",
        "postos de gasolina",
        "estacionamentos",
        "transporte publico",
        "transportation",
        "gas stations",
        "taxi and ride-hailing",
    ],
    "Lazer": ["lazer", "entretenimento", "leisure", "entertainment"],
    "Assinaturas": [
        "servicos digitais",
        "streaming de video",
        "streaming de musica",
        "digital services",
        "video streaming",
        "music streaming",
    ],
    "Saude": ["saude", "farmacia", "health", "pharmacy"],
    "Contas e servicos": [
        "servicos",
        "telecomunicacoes",
        "internet",
        "eletricidade",
        "agua",
        "utilities",
        "services",
        "telecommunications",
        "electricity",
        "water",
    ],
    "Moradia": ["moradia", "aluguel", "housing", "rent"],
    "Educacao": ["educacao", "education"],
    "Compras": ["compras", "compras online", "eletronicos", "vestuario", "shopping", "online shopping"],
    "Viagem": [
        "viagem",
        "viagens",
        "hospedagem",
        "passagens aereas",
        "travel",
        "accommodation",
        "airport and airlines",
    ],
    "Impostos e taxas": ["impostos", "taxas bancarias", "tarifas bancarias", "taxes", "bank fees"],
    "Receita": ["renda", "salario", "income", "salary"],
    "Transferencia": ["transferencia mesma titularidade", "same person transfer"],
    "Investimentos": ["investimentos", "investments"],
}
PLUGGY_PARA_BASE = {chave: base for base, chaves in _PLUGGY.items() for chave in chaves}


def _chave(nome: str) -> str:
    return _sem_acento(nome).lower().strip()


def mapear_categoria_pluggy(nome_pluggy: str | None) -> str | None:
    """Nome da categoria base para a categoria da Pluggy, ou None se desconhecida. Compara sem acento e
    sem caixa porque a Pluggy alterna entre "Saúde" e "Saude" conforme o endpoint/idioma."""
    return PLUGGY_PARA_BASE.get(_chave(nome_pluggy)) if nome_pluggy else None


def semear_categorias(sessao: Session) -> dict[str, int]:
    """Cria o que faltar das categorias e regras base. Regra e identificada pelo padrao: se o usuario
    apagou ou mudou a categoria de uma, ela volta so se o padrao nao existir mais."""
    cats = {c.name: c for c in sessao.scalars(select(Category))}
    novas = 0
    for nome, kind in CATEGORIAS_BASE.items():
        if nome not in cats:
            cats[nome] = Category(name=nome, kind=kind)
            sessao.add(cats[nome])
            novas += 1
    sessao.flush()

    padroes = set(sessao.scalars(select(CategoryRule.pattern)))
    regras = 0
    for i, (padrao, nome) in enumerate(REGRAS_BASE, 1):
        if padrao not in padroes:
            sessao.add(CategoryRule(pattern=padrao, category_id=cats[nome].id, priority=i * 10))
            regras += 1
    sessao.commit()
    return {"categorias": novas, "regras": regras}
