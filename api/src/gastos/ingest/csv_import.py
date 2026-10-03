"""Leitura de CSV de extrato (Nubank conta/cartao e formatos genericos de Inter/BB/Itau).

Colunas sao achadas por nome porque cada banco ordena de um jeito. O cartao Nubank traz gasto como
valor positivo, o oposto do resto do sistema, entao o sinal e invertido so nesse formato.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from gastos.ingest.ofx_import import ler_texto
from gastos.ingest.upsert import obter_ou_criar_conta, upsert_transacoes

_COLUNAS = {
    "data": ("data", "date"),
    "valor": ("valor", "amount"),
    "desc": ("descricao", "historico", "title", "description", "lancamento"),
    "id": ("identificador", "id"),
}


def _sem_acento(s: str) -> str:
    return (
        "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower().strip()
    )


def _achar(cabecalho: dict[str, str], chave: str) -> str | None:
    """cabecalho: nome normalizado -> nome original. Aceita prefixo ("data lancamento")."""
    for cand in _COLUNAS[chave]:
        for norm, orig in cabecalho.items():
            if norm == cand or norm.startswith(cand + " "):
                return orig
    return None


def _valor(texto: str) -> float:
    t = re.sub(r"[^\d,.\-+]", "", texto)
    if "," in t:  # decimal brasileiro: ponto e milhar
        t = t.replace(".", "").replace(",", ".")
    return float(t)


def _data(texto: str) -> date:
    texto = texto.strip()[:10]
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(texto, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"data invalida: {texto!r}")


def importar_csv(sessao: Session, caminho: Path) -> tuple[int, int]:
    texto = ler_texto(caminho).lstrip("﻿")
    primeira = texto.splitlines()[0] if texto else ""
    sep = ";" if primeira.count(";") > primeira.count(",") else ","
    leitor = csv.DictReader(io.StringIO(texto), delimiter=sep)
    cab = {_sem_acento(c): c for c in (leitor.fieldnames or [])}
    c_data, c_valor, c_desc, c_id = (_achar(cab, k) for k in ("data", "valor", "desc", "id"))
    if not (c_data and c_valor and c_desc):
        raise ValueError("colunas de data, valor e descricao nao encontradas")

    cartao_nubank = "title" in cab and "amount" in cab and "identificador" not in cab
    bank = "Nubank" if cartao_nubank or c_id == "Identificador" else caminho.stem
    acct = obter_ou_criar_conta(
        sessao,
        "csv",
        bank,
        "credit" if cartao_nubank else "checking",
        f"{bank} {caminho.stem}",
        f"csv:{caminho.stem}",
    )

    vistos: dict[str, int] = {}
    registros = []
    for linha in leitor:
        if not (linha.get(c_data) and linha.get(c_valor)):
            continue
        d, valor = _data(linha[c_data]), _valor(linha[c_valor])
        if cartao_nubank:
            valor = -valor
        desc = (linha.get(c_desc) or "").strip()
        ext = (linha.get(c_id) or "").strip() if c_id else ""
        if not ext:
            base = hashlib.sha1(f"{d}|{valor:.2f}|{desc}".encode()).hexdigest()
            vistos[base] = vistos.get(base, 0) + 1  # compras identicas no mesmo dia nao podem colidir
            ext = f"csv:{base}" + (f":{vistos[base]}" if vistos[base] > 1 else "")
        registros.append(
            {
                "external_id": ext,
                "date": d,
                "description": desc,
                "amount": valor,
                "type": "DEBIT" if valor < 0 else "CREDIT",
                "status": "POSTED",
            }
        )
    return upsert_transacoes(sessao, acct, registros)
