"""Deteccao de recorrencias (assinatura, parcela, detectada). Regras na skill dominio-financeiro.

`detectar_recorrencias` e pura sobre `TxRecorrencia`; `atualizar_recorrencias` so traduz para o banco e
aplica a decisao do usuario por cima (descartada nunca volta, confirmada fica ativa).
"""

from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from itertools import pairwise
from statistics import mean, median, pstdev

from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.domain.categorize import categorias_efetivas, eh_gasto
from gastos.domain.models import Account, Recurrence, Transaction, TransactionOverride

# Janelas do intervalo mediano em dias. Mensal 28-33 cobre fevereiro e vencimento que cai em fim de semana;
# semanal 6-8 e anual 350-380 seguem a mesma folga de 1 a 2 dias uteis.
JANELAS = (("semanal", 6, 8), ("mensal", 28, 33), ("anual", 350, 380))
DIAS_PERIODO = {"semanal": 7, "mensal": 30, "anual": 365}
CV_ESTAVEL = 0.15  # desvio/media abaixo disso = mesmo valor (reajuste pequeno, IOF de cartao)
# Fracao minima de intervalos dentro da janela. So a mediana deixa passar compra aleatoria frequente
# (lanchonete ~2x/mes cai com mediana 7 dias por acaso); 50% ainda tolera um mes pulado a cada dois.
REGULARIDADE_MIN = 0.5


@dataclass(frozen=True)
class TxRecorrencia:
    id: int
    account_id: int
    date: date
    amount: float
    description_norm: str
    installment_n: int | None = None
    installment_total: int | None = None


@dataclass
class RecorrenciaDetectada:
    merchant_norm: str
    account_id: int
    periodicity: str
    kind: str
    expected_amount: float
    expected_day: int | None
    next_due: date | None
    ends_at: date | None
    occurrences: int
    confidence: float
    active: bool
    transaction_ids: list[int] = field(default_factory=list)


def somar_meses(d: date, n: int) -> date:
    """Mesmo dia n meses depois, preso ao ultimo dia do mes (31/01 + 1 mes = 28/02)."""
    a, m = divmod(d.month - 1 + n, 12)
    ano, mes = d.year + a, m + 1
    return date(ano, mes, min(d.day, monthrange(ano, mes)[1]))


def avancar(d: date, periodicidade: str, k: int, intervalo: float = 7) -> date:
    """k periodos depois de d. Mensal/anual andam por mes de calendario (e nao por 30 dias) para o
    vencimento nao escorregar de dia ao longo de uma parcela de 12 meses."""
    if periodicidade == "mensal":
        return somar_meses(d, k)
    if periodicidade == "anual":
        return somar_meses(d, 12 * k)
    return d + timedelta(days=round(intervalo) * k)


def _periodicidade(intervalos: list[int]) -> tuple[str | None, float]:
    """(periodicidade, intervalo mediano). None se a mediana cai fora das janelas ou se menos da metade
    dos intervalos esta dentro da janela da mediana."""
    mediano = median(intervalos)
    for nome, lo, hi in JANELAS:
        if lo <= mediano <= hi:
            dentro = sum(lo <= i <= hi for i in intervalos) / len(intervalos)
            return (nome if dentro >= REGULARIDADE_MIN else None), mediano
    return None, mediano


def detectar_recorrencias(
    transacoes, tipo_conta_por_id: dict[int, str], hoje: date
) -> list[RecorrenciaDetectada]:
    """Grupos (description_norm, account_id) com >= 3 gastos, intervalo mediano numa janela periodica e
    >= 50% dos intervalos nessa janela.
    A entrada ja deve vir sem transacoes excluidas; entradas de dinheiro sao ignoradas aqui.
    confidence = min(1, 0.5 + 0.1*(n-3)) * (1 se cv < 0.15 senao 0.7). active = falso quando a ultima
    ocorrencia passou de 2 intervalos (um atraso de boleto nao encerra; dois seguidos sim)."""
    grupos = defaultdict(list)
    for t in transacoes:
        if t.amount < 0:
            grupos[(t.description_norm, t.account_id)].append(t)

    out = []
    for (nome, conta), txs in sorted(grupos.items()):
        if len(txs) < 3:
            continue
        txs.sort(key=lambda t: (t.date, t.id))
        per, intervalo = _periodicidade([(b.date - a.date).days for a, b in pairwise(txs)])
        if per is None:
            continue
        valores = [-t.amount for t in txs]
        estavel = pstdev(valores) / mean(valores) < CV_ESTAVEL
        n = len(txs)
        ultima = txs[-1]

        ends_at = None
        if ultima.installment_total:
            kind = "parcela"
            restantes = max(ultima.installment_total - (ultima.installment_n or ultima.installment_total), 0)
            ends_at = avancar(ultima.date, per, restantes, intervalo)
            next_due = avancar(ultima.date, per, 1, intervalo) if restantes else None
        else:
            assinatura = tipo_conta_por_id.get(conta) == "credit" and per in ("mensal", "anual") and estavel
            kind = "assinatura" if assinatura else "detectada"
            next_due = avancar(ultima.date, per, 1, intervalo)

        out.append(
            RecorrenciaDetectada(
                merchant_norm=nome,
                account_id=conta,
                periodicity=per,
                kind=kind,
                expected_amount=round(median(valores), 2),
                expected_day=round(median(t.date.day for t in txs)) if per == "mensal" else None,
                next_due=next_due,
                ends_at=ends_at,
                occurrences=n,
                confidence=round(min(1.0, 0.5 + 0.1 * (n - 3)) * (1.0 if estavel else 0.7), 4),
                active=(hoje - ultima.date).days <= 2 * intervalo,
                transaction_ids=[t.id for t in txs],
            )
        )
    return out


def transacoes_recorrentes(sessao: Session) -> dict[int, int]:
    """transaction_id -> recurrence_id para gastos nao excluidos cujo grupo tem recorrencia nao descartada.
    Calculado na leitura pela chave do grupo, entao ja cobre transacoes novas antes do proximo
    atualizar_recorrencias."""
    recs = {
        (r.merchant_norm, r.account_id): r.id
        for r in sessao.scalars(select(Recurrence))
        if r.user_decision != "descartada"
    }
    if not recs:
        return {}
    excluidas = set(
        sessao.scalars(
            select(TransactionOverride.transaction_id).where(TransactionOverride.exclude.is_(True))
        )
    )
    linhas = sessao.execute(
        select(Transaction.id, Transaction.description_norm, Transaction.account_id).where(
            Transaction.amount < 0
        )
    )
    return {tid: recs[(n, a)] for tid, n, a in linhas if (n, a) in recs and tid not in excluidas}


def atualizar_recorrencias(sessao: Session, hoje: date) -> dict[int, int]:
    """Roda a deteccao sobre todos os gastos e grava em Recurrence (chave merchant_norm + account_id).
    Descartada: intocada. Confirmada: estatisticas atualizadas, mas active=True e confidence=1.
    Recorrencia que deixou de ser detectada e marcada inativa quando passa de 2 intervalos sem ocorrencia
    (hoje > next_due + 1 intervalo, ja que next_due = ultima + 1 intervalo)."""
    txs = list(sessao.scalars(select(Transaction)))
    efetivas = categorias_efetivas(sessao, txs)
    tipos = dict(sessao.execute(select(Account.id, Account.type)).all())
    entrada = [
        TxRecorrencia(
            t.id, t.account_id, t.date, t.amount, t.description_norm, t.installment_n, t.installment_total
        )
        for t in txs
        if eh_gasto(t.amount, efetivas[t.id][0], efetivas[t.id][2])
    ]
    existentes = {(r.merchant_norm, r.account_id): r for r in sessao.scalars(select(Recurrence))}

    vistas = set()
    for d in detectar_recorrencias(entrada, tipos, hoje):
        chave = (d.merchant_norm, d.account_id)
        vistas.add(chave)
        r = existentes.get(chave)
        if r is None:
            r = Recurrence(merchant_norm=d.merchant_norm, account_id=d.account_id)
            sessao.add(r)
        elif r.user_decision == "descartada":
            continue
        for campo in (
            "periodicity",
            "kind",
            "expected_amount",
            "expected_day",
            "next_due",
            "ends_at",
            "occurrences",
            "confidence",
            "active",
        ):
            setattr(r, campo, getattr(d, campo))
        if r.category_id is None:
            cat = efetivas[d.transaction_ids[-1]][0]
            r.category_id = cat.id if cat else None
        if r.user_decision == "confirmada":
            r.active, r.confidence = True, 1.0

    for chave, r in existentes.items():
        if (
            chave not in vistas
            and r.active
            and r.user_decision is None
            and r.next_due
            and hoje > r.next_due + timedelta(days=DIAS_PERIODO.get(r.periodicity, 30))
        ):
            r.active = False
    sessao.commit()
    return transacoes_recorrentes(sessao)
