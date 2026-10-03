"""Aplica as acoes propostas pelo LLM (ou por qualquer cliente) depois que o usuario as aprovou na tela.

O modelo nunca escreve no banco: ele devolve propostas, a tela mostra, o usuario escolhe e so entao
isto roda. Categorizar vira regra pela descricao normalizada inteira (vale para o passado e para as
proximas importacoes); criar categoria segue as mesmas regras do POST /categories.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.domain.models import Category, CategoryRule
from gastos.domain.pipeline import recalcular
from gastos.domain.seed import KINDS

PRIORIDADE_IA = 5  # perde para regra feita a mao na tela (1) e vence as regras seed (10+)


def aplicar_acoes(sessao: Session, acoes: list[dict]) -> dict:
    """Primeiro cria as categorias, depois as regras, para uma acao "categorizar" poder apontar para
    uma categoria criada no mesmo lote. Acao invalida nao derruba o lote: entra em `ignoradas` com o
    motivo, e as outras seguem."""
    cats = {c.name.lower(): c for c in sessao.scalars(select(Category))}
    criadas = regras = 0
    ignoradas: list[str] = []

    for a in acoes:
        if a.get("tipo") != "criar_categoria":
            continue
        nome = (a.get("nome") or "").strip()
        if not nome:
            ignoradas.append("categoria sem nome")
            continue
        if nome.lower() in cats:
            continue  # ja existe: idempotente
        mae = cats.get((a.get("mae") or "").strip().lower())
        if mae is not None and mae.parent_id is not None:
            ignoradas.append(f"{nome}: {mae.name} ja e subcategoria, so ha um nivel")
            continue
        kind = mae.kind if mae is not None else a.get("kind")
        if kind not in KINDS:
            ignoradas.append(f"{nome}: tipo invalido")
            continue
        c = Category(name=nome[:60], kind=kind, parent_id=mae.id if mae is not None else None)
        sessao.add(c)
        sessao.flush()
        cats[c.name.lower()] = c
        criadas += 1

    padroes = {r.pattern: r for r in sessao.scalars(select(CategoryRule))}
    for a in acoes:
        if a.get("tipo") != "categorizar":
            continue
        desc = (a.get("descricao") or "").strip()
        cat = cats.get((a.get("categoria") or "").strip().lower())
        if not desc or cat is None:
            ignoradas.append(f"{desc or '?'}: categoria desconhecida")
            continue
        padrao = f"^{re.escape(desc)}$"
        if (r := padroes.get(padrao)) is not None:
            r.category_id = cat.id  # mesma descricao, decisao nova: atualiza em vez de duplicar
        else:
            padroes[padrao] = CategoryRule(pattern=padrao, category_id=cat.id, priority=PRIORIDADE_IA)
            sessao.add(padroes[padrao])
        regras += 1
    sessao.commit()
    if criadas or regras:
        recalcular(sessao)  # recorrencias e previsao dependem da categoria efetiva
    return {"categorias_criadas": criadas, "regras_criadas": regras, "ignoradas": ignoradas}
