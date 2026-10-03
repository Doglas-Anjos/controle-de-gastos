"""Passo unico apos qualquer ingestao: semeia categorias, aplica transferencias internas, refaz
recorrencias e previsao. Existe para sync, import, upload e CLI chamarem a mesma coisa."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from gastos.domain.categorize import recategorizar_tudo
from gastos.domain.forecast import prever
from gastos.domain.recurrence import atualizar_recorrencias
from gastos.domain.seed import semear_categorias


def recalcular(sessao: Session, hoje: date | None = None) -> dict[str, int]:
    hoje = hoje or date.today()
    semear_categorias(sessao)
    cont = recategorizar_tudo(sessao)
    recorrentes = atualizar_recorrencias(sessao, hoje)
    linhas = prever(sessao, hoje)
    return {**cont, "transacoes_recorrentes": len(recorrentes), "linhas_previsao": len(linhas)}
