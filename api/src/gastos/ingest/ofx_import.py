"""Leitura de OFX (conta corrente e cartao). Bancos brasileiros exportam em cp1252/latin-1 mesmo quando
o cabecalho diz outra coisa, entao tentamos utf-8 e caimos para cp1252; latin-1 nunca falha."""

from __future__ import annotations

import io
from pathlib import Path

from ofxparse import AccountType, OfxParser
from sqlalchemy.orm import Session

from gastos.ingest.upsert import obter_ou_criar_conta, upsert_transacoes


def ler_texto(caminho: Path) -> str:
    bruto = caminho.read_bytes()
    for enc in ("utf-8", "cp1252"):
        try:
            return bruto.decode(enc)
        except UnicodeDecodeError:
            pass
    return bruto.decode("latin-1")


def importar_ofx(sessao: Session, caminho: Path) -> tuple[int, int]:
    ofx = OfxParser.parse(io.StringIO(ler_texto(caminho)))
    novas = atualizadas = 0
    for conta in ofx.accounts:
        inst = getattr(conta, "institution", None)
        bank = (inst.organization if inst and inst.organization else None) or caminho.stem
        credito = (
            conta.type == AccountType.CreditCard
        )  # cartao nao tem ACCTTYPE; ofxparse distingue pelo tipo
        acct = obter_ou_criar_conta(
            sessao,
            "ofx",
            bank,
            "credit" if credito else "checking",
            f"{bank} {conta.account_id}",
            conta.account_id,
        )
        registros = [
            {
                "external_id": f"ofx:{conta.account_id}:{t.id}",
                "date": t.date.date(),
                "description": (t.memo or t.payee or "").strip(),
                "amount": float(t.amount),
                "type": "DEBIT" if t.amount < 0 else "CREDIT",
                "status": "POSTED",
            }
            for t in conta.statement.transactions
        ]
        n, a = upsert_transacoes(sessao, acct, registros)
        novas, atualizadas = novas + n, atualizadas + a
    return novas, atualizadas
