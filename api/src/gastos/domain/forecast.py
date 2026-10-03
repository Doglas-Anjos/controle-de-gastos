"""Previsao de gastos v1 (skill dominio-financeiro): parte fixa das recorrencias + parte variavel por
mediana. So stdlib; statsforecast fica para a v2 (> 24 meses de historico).

Horizonte = os `h` meses seguintes ao mes de `hoje`. O mes corrente fica de fora porque esta pela metade:
a parte fixa dele ja foi parcialmente paga (next_due aponta para o mes seguinte) e a variavel seria
subestimada. O historico usa so meses completos (anteriores ao mes de hoje).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from statistics import median, quantiles

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from gastos.domain.categorize import categoria_out, categorias_efetivas, eh_gasto
from gastos.domain.models import Category, Forecast, Recurrence, Transaction
from gastos.domain.recurrence import avancar, somar_meses, transacoes_recorrentes

MESES_SAZONAL = 13  # precisa de m-12 para todo mes do horizonte e de 3 meses recentes


def mes_str(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _vencimentos_no_mes(r: Recurrence, inicio_mes: date) -> int:
    """Quantos vencimentos de r caem no mes (semanal pode ter 4 ou 5), parando em ends_at para parcelas."""
    if r.next_due is None:
        return 0
    fim = somar_meses(inicio_mes, 1)
    n = k = 0
    while (d := avancar(r.next_due, r.periodicity, k)) < fim and not (r.ends_at and d > r.ends_at):
        n += d >= inicio_mes
        k += 1
    return n


def _quartis(valores: list[float]) -> tuple[float, float]:
    if len(valores) < 2:
        return valores[0], valores[0]
    q1, _, q3 = quantiles(valores, n=4, method="inclusive")
    return q1, q3


def prever(sessao: Session, hoje: date, horizonte: int = 3) -> list[dict]:
    """Uma linha por (mes, categoria): amount = fixa + variavel; low/high = p25/p75 dos ultimos 6 meses
    da parte variavel + fixa (alargados para conter amount). method = recorrencia quando a categoria so
    tem parte fixa; senao mediana3 ou sazonal (media entre mediana3 e m-12 quando ha >= 13 meses).
    Regrava a tabela Forecast para os meses do horizonte (ela e so cache)."""
    inicio = hoje.replace(day=1)
    alvos = [somar_meses(inicio, k) for k in range(1, horizonte + 1)]
    cats = {c.id: c for c in sessao.scalars(select(Category))}

    fixa = defaultdict(float)
    for r in sessao.scalars(select(Recurrence).where(Recurrence.active.is_(True))):
        cat = cats.get(r.category_id)
        if cat is not None and cat.kind in ("receita", "transferencia"):
            continue
        for alvo in alvos:
            if n := _vencimentos_no_mes(r, alvo):
                fixa[(mes_str(alvo), r.category_id)] += n * r.expected_amount

    txs = list(sessao.scalars(select(Transaction).where(Transaction.date < inicio)))
    efetivas = categorias_efetivas(sessao, txs)
    recorrentes = transacoes_recorrentes(sessao)
    historico = defaultdict(lambda: defaultdict(float))
    for t in txs:
        cat, _, excluida = efetivas[t.id]
        if (
            t.id not in recorrentes
            and cat is not None
            and cat.kind == "variavel"
            and eh_gasto(t.amount, cat, excluida)
        ):
            historico[cat.id][mes_str(t.date)] += -t.amount

    variavel = {}
    if historico:
        primeiro = min(t.date for t in txs).replace(day=1)
        meses_hist = []
        while primeiro < inicio:
            meses_hist.append(mes_str(primeiro))
            primeiro = somar_meses(primeiro, 1)
        for cat_id, por_mes in historico.items():
            serie = [por_mes.get(m, 0.0) for m in meses_hist]
            base = median(serie[-3:])
            low, high = _quartis(serie[-6:])
            for alvo in alvos:
                if len(serie) >= MESES_SAZONAL:
                    valor = (base + por_mes.get(mes_str(somar_meses(alvo, -12)), 0.0)) / 2
                    variavel[(mes_str(alvo), cat_id)] = (valor, low, high, "sazonal")
                else:
                    variavel[(mes_str(alvo), cat_id)] = (base, low, high, "mediana3")

    linhas = []
    for chave in sorted(set(fixa) | set(variavel), key=lambda k: (k[0], k[1] or 0)):
        f = fixa.get(chave, 0.0)
        v, lo, hi, metodo = variavel.get(chave, (0.0, 0.0, 0.0, "recorrencia"))
        amount = f + v
        if amount <= 0 and hi <= 0:
            continue
        mes, cat_id = chave
        linhas.append(
            {
                "month": mes,
                "category": categoria_out(cats.get(cat_id)),
                "amount": round(amount, 2),
                "low": round(min(f + lo, amount), 2),
                "high": round(max(f + hi, amount), 2),
                "method": metodo,
            }
        )

    meses = [mes_str(a) for a in alvos]
    sessao.execute(delete(Forecast).where(Forecast.month.in_(meses)))
    sessao.add_all(
        Forecast(
            month=ln["month"],
            category_id=ln["category"]["id"] if ln["category"] else None,
            amount=ln["amount"],
            low=ln["low"],
            high=ln["high"],
            method=ln["method"],
        )
        for ln in linhas
    )
    sessao.commit()
    return linhas
