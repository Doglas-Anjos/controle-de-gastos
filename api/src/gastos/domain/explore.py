"""Explorador por tipo de gasto (skill dominio-financeiro): historico mensal de uma categoria (ou de todos
os gastos) separado em cartao/conta/recorrente e extrapolado pela media da janela.

Media simples, e nao o modelo de forecast.py, porque aqui o usuario escolhe a janela (3 a 24 meses) para
ver "quanto custa esse tipo de gasto em media" e como o ultimo mes se compara; e uma lente, nao previsao.
"""

from __future__ import annotations

from datetime import date
from statistics import mean, median, stdev

from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.domain.categorize import categoria_out, categorias_efetivas, eh_gasto
from gastos.domain.forecast import mes_str
from gastos.domain.models import Account, Category, Transaction
from gastos.domain.recurrence import somar_meses, transacoes_recorrentes

CAMPOS = ("total", "card", "bank", "recurring")


def series_mensal(gastos, inicio_mes: date, months: int) -> list[dict]:
    """`gastos` = (data, valor positivo, eh_cartao, eh_recorrente). Devolve os `months` meses completos
    anteriores a `inicio_mes` (o mes corrente fica de fora por estar pela metade, como em forecast.py),
    com 0 nos meses sem gasto para a media nao ignorar mes vazio. bank = tudo que nao e cartao."""
    meses = [mes_str(somar_meses(inicio_mes, k)) for k in range(-months, 0)]
    serie = {m: dict.fromkeys(CAMPOS, 0.0) for m in meses}
    for d, valor, cartao, recorrente in gastos:
        p = serie.get(mes_str(d))
        if p is None:
            continue
        p["total"] += valor
        p["card" if cartao else "bank"] += valor
        p["recurring"] += valor if recorrente else 0.0
    return [{"month": m, **{c: round(v, 2) for c, v in serie[m].items()}} for m in meses]


def projecao(sessao: Session, hoje: date, category_id: int | None, months: int, horizon: int) -> dict:
    """Formato de schemas.ProjectionOut. Gasto = eh_gasto sobre a categoria efetiva; category_id None =
    todos. Cada ponto projetado repete a media da janela campo a campo (sem tendencia: com 3-24 pontos
    ruidosos uma reta extrapolada erra mais que a media). stdev = 0 com menos de 2 meses."""
    inicio = hoje.replace(day=1)
    txs = list(
        sessao.scalars(
            select(Transaction).where(
                Transaction.date >= somar_meses(inicio, -months), Transaction.date < inicio
            )
        )
    )
    efetivas = categorias_efetivas(sessao, txs)
    cartoes = set(sessao.scalars(select(Account.id).where(Account.type == "credit")))
    recorrentes = transacoes_recorrentes(sessao)
    gastos = []
    for t in txs:
        cat, _, excluida = efetivas[t.id]
        if eh_gasto(t.amount, cat, excluida) and (category_id is None or (cat and cat.id == category_id)):
            gastos.append((t.date, -t.amount, t.account_id in cartoes, t.id in recorrentes))

    historico = series_mensal(gastos, inicio, months)
    totais = [p["total"] for p in historico]
    media = mean(totais)
    medias = {c: round(mean(p[c] for p in historico), 2) for c in CAMPOS}
    projecoes = [
        {"month": mes_str(somar_meses(inicio, k)), **medias, "projected": True} for k in range(1, horizon + 1)
    ]
    ultimo = totais[-1]
    return {
        "category": categoria_out(sessao.get(Category, category_id)) if category_id is not None else None,
        "months_window": months,
        "horizon": horizon,
        "history": historico,
        "projection": projecoes,
        "mean": round(media, 2),
        "median": round(median(totais), 2),
        "stdev": round(stdev(totais), 2) if len(totais) >= 2 else 0.0,
        "last_month": ultimo,
        "trend_pct": round((ultimo - media) / media, 4) if media else None,
    }
