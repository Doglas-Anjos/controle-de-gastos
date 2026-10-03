"""Resumo mensal no formato de schemas.SummaryOut: gasto por categoria efetiva e mes, total e receita."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gastos.domain.categorize import categoria_out, categorias_efetivas, eh_gasto
from gastos.domain.forecast import mes_str
from gastos.domain.models import Account, Transaction
from gastos.domain.recurrence import somar_meses
from gastos.domain.seed import SEM_CATEGORIA


def resumo_mensal(sessao: Session, meses: int = 12) -> dict:
    """Ultimos `meses` meses terminando no mes da transacao mais recente (meses vazios aparecem com 0).
    Gasto segue eh_gasto (sem excluidas nem kind=transferencia). Receita = entradas nao excluidas fora de
    kind=transferencia, para resgate de investimento e pagamento de fatura nao inflarem a renda."""
    vazio = {"count": 0, "total": 0.0}
    ultima = sessao.scalar(select(func.max(Transaction.date)))
    if ultima is None:
        return {
            "months": [],
            "by_category": [],
            "total_by_month": {},
            "income_by_month": {},
            "uncategorized": vazio,
        }
    inicio = somar_meses(ultima.replace(day=1), -(meses - 1))
    lista = [mes_str(somar_meses(inicio, k)) for k in range(meses)]

    txs = list(sessao.scalars(select(Transaction).where(Transaction.date >= inicio)))
    efetivas = categorias_efetivas(sessao, txs)
    gastos, cats = defaultdict(float), {}
    receita = dict.fromkeys(lista, 0.0)
    sem = dict(vazio)
    for t in txs:
        cat, _, excluida = efetivas[t.id]
        m = mes_str(t.date)
        if eh_gasto(t.amount, cat, excluida):
            chave = cat.id if cat else None
            cats[chave] = cat
            gastos[(m, chave)] -= t.amount
            if cat is None or cat.name == SEM_CATEGORIA:
                sem["count"] += 1
                sem["total"] -= t.amount
        elif t.amount > 0 and not excluida and (cat is None or cat.kind != "transferencia"):
            receita[m] += t.amount

    total = dict.fromkeys(lista, 0.0)
    for (m, _), v in gastos.items():
        total[m] += v
    by_category = [
        {"month": m, "category": categoria_out(cats[c]), "total": round(v, 2)}
        for (m, c), v in sorted(gastos.items(), key=lambda kv: (kv[0][0], -kv[1]))
    ]
    return {
        "months": lista,
        "by_category": by_category,
        "total_by_month": {m: round(v, 2) for m, v in total.items()},
        "income_by_month": {m: round(v, 2) for m, v in receita.items()},
        "uncategorized": {"count": sem["count"], "total": round(sem["total"], 2)},
    }


def grupos_sem_categoria(sessao: Session, meses: int = 6, limite: int = 40) -> list[dict]:
    """Lancamentos ainda em "Sem categoria" agrupados por descricao normalizada e origem (conta corrente
    ou cartao), maiores primeiro. E o que o LLM recebe para catalogar: so a descricao normalizada (sem
    numeros, documento ou conta), contagem e total do grupo, nunca a transacao individual. `limite`
    segura o tamanho do prompt."""
    ultima = sessao.scalar(select(func.max(Transaction.date)))
    if ultima is None:
        return []
    inicio = somar_meses(ultima.replace(day=1), -(meses - 1))
    txs = list(sessao.scalars(select(Transaction).where(Transaction.date >= inicio)))
    efetivas = categorias_efetivas(sessao, txs)
    contas = {a.id: a for a in sessao.scalars(select(Account))}
    grupos: dict[tuple[str, str], dict] = {}
    for t in txs:
        cat, _, excluida = efetivas[t.id]
        if excluida or (cat is not None and cat.name != SEM_CATEGORIA):
            continue
        origem = "cartao" if contas[t.account_id].type == "credit" else "conta corrente"
        g = grupos.setdefault(
            (t.description_norm, origem),
            {"descricao": t.description_norm, "origem": origem, "n": 0, "soma": 0.0, "ultima": t.date},
        )
        g["n"] += 1
        g["soma"] += t.amount
        g["ultima"] = max(g["ultima"], t.date)
    maiores = sorted(grupos.values(), key=lambda g: -abs(g["soma"]))[:limite]
    return [
        {
            "descricao": g["descricao"],
            "origem": g["origem"],
            "fluxo": "entrada" if g["soma"] > 0 else "saida",
            "n": g["n"],
            "total": round(abs(g["soma"]), 2),
            "ultima": g["ultima"].isoformat(),
        }
        for g in maiores
    ]
