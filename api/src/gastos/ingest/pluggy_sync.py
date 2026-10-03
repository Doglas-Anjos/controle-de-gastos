"""Sincronizacao Pluggy -> banco local. Erro de item (login, MFA) e problema do usuario, nao do codigo:
vira entrada em errors e o sync segue. Logs so com contagens; item id e transacao nunca aparecem."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.orm import Session

from gastos.ingest.pluggy_client import PluggyClient, PluggyError
from gastos.ingest.upsert import obter_ou_criar_conta, upsert_transacoes

log = logging.getLogger(__name__)
_ITEM_COM_PROBLEMA = {"LOGIN_ERROR", "WAITING_USER_INPUT"}


def _tipo_conta(conta: dict) -> str | None:
    if conta.get("type") == "CREDIT":
        return "credit"
    if conta.get("type") == "BANK":
        return "savings" if conta.get("subtype") == "SAVINGS_ACCOUNT" else "checking"
    return None


def _registro(t: dict, meses_fatura: dict[str, str]) -> dict:
    meta = t.get("creditCardMetadata") or {}
    valor = float(t["amount"])
    return {
        "external_id": t["id"],
        "date": date.fromisoformat(t["date"][:10]),
        "description": t.get("description") or "",
        "amount": valor,
        "type": t.get("type") or ("DEBIT" if valor < 0 else "CREDIT"),
        "status": t.get("status") or "POSTED",
        "pluggy_category": t.get("category"),
        "installment_n": meta.get("installmentNumber"),
        "installment_total": meta.get("totalInstallments"),
        "bill_month": meses_fatura.get(meta.get("billId")),
        "raw_json": t,
    }


def sincronizar(sessao: Session, client: PluggyClient, item_ids: list[str], desde: date | None) -> dict:
    res = {"items": 0, "accounts": 0, "transactions_new": 0, "transactions_updated": 0, "errors": []}
    hoje = date.today()
    for i, item_id in enumerate(item_ids, 1):
        rotulo = f"item {i}"  # o id e segredo, entao so a posicao aparece
        try:
            item = client.item(item_id)
            if item.get("status") in _ITEM_COM_PROBLEMA:
                res["errors"].append(
                    f"{rotulo}: conexao precisa de atencao ({item['status']}); reconecte no painel da Pluggy"
                )
                continue
            banco = (item.get("connector") or {}).get("name") or "Pluggy"
            for conta in client.accounts(item_id):
                tipo = _tipo_conta(conta)
                if tipo is None:
                    continue
                acct = obter_ou_criar_conta(
                    sessao, "pluggy", banco, tipo, conta.get("name") or banco, conta["id"]
                )
                ini = desde or (
                    acct.last_sync_at.date() - timedelta(days=7)
                    if acct.last_sync_at
                    else hoje - timedelta(days=90)
                )
                faturas = {}
                if tipo == "credit":  # mes da fatura = mes do vencimento
                    faturas = {
                        b["id"]: b["dueDate"][:7] for b in client.bills(conta["id"]) if b.get("dueDate")
                    }
                registros = [_registro(t, faturas) for t in client.transactions(conta["id"], ini, hoje)]
                n, a = upsert_transacoes(sessao, acct, registros)
                acct.last_sync_at = datetime.now(UTC).replace(tzinfo=None)
                sessao.commit()
                res["accounts"] += 1
                res["transactions_new"] += n
                res["transactions_updated"] += a
            res["items"] += 1
        except PluggyError as e:
            sessao.rollback()
            res["errors"].append(f"{rotulo}: {e}")
    log.info(
        "sync: %d itens, %d contas, %d novas, %d atualizadas, %d erros",
        res["items"],
        res["accounts"],
        res["transactions_new"],
        res["transactions_updated"],
        len(res["errors"]),
    )
    return res
