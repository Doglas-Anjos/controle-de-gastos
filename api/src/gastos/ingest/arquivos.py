"""Despacho por extensao, compartilhado entre CLI e API para os dois caminhos tratarem arquivos igual."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gastos.domain.models import Account
from gastos.ingest.csv_import import importar_csv
from gastos.ingest.ofx_import import importar_ofx


def importar_arquivo(sessao: Session, caminho: Path) -> tuple[int, int, int]:
    """Devolve (contas_novas, transacoes_novas, transacoes_atualizadas)."""
    ext = caminho.suffix.lower()
    if ext not in (".ofx", ".csv"):
        raise ValueError(f"extensao nao suportada: {ext}")
    antes = sessao.scalar(select(func.count(Account.id)))
    novas, atualizadas = (importar_ofx if ext == ".ofx" else importar_csv)(sessao, caminho)
    return sessao.scalar(select(func.count(Account.id))) - antes, novas, atualizadas
