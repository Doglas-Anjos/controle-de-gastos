"""Escrita idempotente de transacoes. Chave natural e external_id: reimportar o mesmo extrato ou
re-sincronizar a Pluggy atualiza a linha existente e nunca apaga nada, entao overrides e regras
(tabelas separadas) sobrevivem. Transacao PENDING vira POSTED no update."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.domain.models import Account, Transaction
from gastos.domain.normalize import normalizar

_CAMPOS = (
    "date",
    "description",
    "amount",
    "type",
    "status",
    "pluggy_category",
    "installment_n",
    "installment_total",
    "bill_month",
    "raw_json",
)


def obter_ou_criar_conta(
    sessao: Session, source: str, bank: str, type: str, name: str, external_id: str | None
) -> Account:
    """Sem external_id a conta e identificada por origem+banco+tipo+nome."""
    if external_id:
        conta = sessao.scalar(select(Account).where(Account.external_id == external_id))
    else:
        conta = sessao.scalar(
            select(Account).where(
                Account.source == source, Account.bank == bank, Account.type == type, Account.name == name
            )
        )
    if conta is None:
        conta = Account(source=source, bank=bank, type=type, name=name, external_id=external_id)
        sessao.add(conta)
        sessao.flush()
    return conta


def upsert_transacoes(sessao: Session, account: Account, registros: list[dict]) -> tuple[int, int]:
    """Parcela do registro (Pluggy) tem prioridade; so cai para o texto da descricao quando ausente."""
    ids = [r["external_id"] for r in registros]
    existentes = {
        t.external_id: t for t in sessao.scalars(select(Transaction).where(Transaction.external_id.in_(ids)))
    }
    novas = atualizadas = 0
    for r in registros:
        norm = normalizar(r["description"])
        dados = {c: r.get(c) for c in _CAMPOS}
        dados["status"] = dados["status"] or "POSTED"
        dados["description_norm"] = norm.description_norm
        if dados["installment_n"] is None:
            dados["installment_n"], dados["installment_total"] = norm.installment_n, norm.installment_total
        t = existentes.get(r["external_id"])
        if t is None:
            t = Transaction(account_id=account.id, external_id=r["external_id"], **dados)
            sessao.add(t)
            existentes[t.external_id] = t  # repetido no mesmo lote vira update, nao violacao de unique
            novas += 1
        else:
            for k, v in dados.items():
                setattr(t, k, v)
            atualizadas += 1
    sessao.commit()
    return novas, atualizadas
