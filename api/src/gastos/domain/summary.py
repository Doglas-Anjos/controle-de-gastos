"""Resumo mensal no formato de schemas.SummaryOut: gasto por categoria efetiva e mes, total e receita."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gastos.domain.categorize import categoria_out, categorias_efetivas, eh_gasto
from gastos.domain.forecast import mes_str
from gastos.domain.models import Transaction
from gastos.domain.recurrence import somar_meses


def resumo_mensal(sessao: Session, meses: int = 12) -> dict:
    """Ultimos `meses` meses terminando no mes da transacao mais recente (meses vazios aparecem com 0).
    Gasto segue eh_gasto (sem excluidas nem kind=transferencia). Receita = entradas nao excluidas fora de
    kind=transferencia, para resgate de investimento e pagamento de fatura nao inflarem a renda."""
    ultima = sessao.scalar(select(func.max(Transaction.date)))
    if ultima is None:
        return {"months": [], "by_category": [], "total_by_month": {}, "income_by_month": {}}
    inicio = somar_meses(ultima.replace(day=1), -(meses - 1))
    lista = [mes_str(somar_meses(inicio, k)) for k in range(meses)]

    txs = list(sessao.scalars(select(Transaction).where(Transaction.date >= inicio)))
    efetivas = categorias_efetivas(sessao, txs)
    gastos, cats = defaultdict(float), {}
    receita = dict.fromkeys(lista, 0.0)
    for t in txs:
        cat, _, excluida = efetivas[t.id]
        m = mes_str(t.date)
        if eh_gasto(t.amount, cat, excluida):
            chave = cat.id if cat else None
            cats[chave] = cat
            gastos[(m, chave)] -= t.amount
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
    }
