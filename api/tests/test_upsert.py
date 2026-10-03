from datetime import date
from pathlib import Path

from sqlalchemy import func, select

from gastos.domain.models import Transaction, TransactionOverride
from gastos.ingest.ofx_import import importar_ofx
from gastos.ingest.upsert import obter_ou_criar_conta, upsert_transacoes

FIX = Path(__file__).parent / "fixtures" / "ofx" / "conta_corrente.ofx"


def _reg(**kw):
    base = dict(
        external_id="x1",
        date=date(2026, 9, 1),
        description="STREAMING ALFA 03/12",
        amount=-10.0,
        type="DEBIT",
        status="PENDING",
    )
    return base | kw


def test_conta_e_reaproveitada(sessao):
    a = obter_ou_criar_conta(sessao, "pluggy", "B", "checking", "n", "ext")
    assert obter_ou_criar_conta(sessao, "pluggy", "B", "checking", "n", "ext").id == a.id
    b = obter_ou_criar_conta(sessao, "csv", "B", "checking", "n", None)
    assert obter_ou_criar_conta(sessao, "csv", "B", "checking", "n", None).id == b.id != a.id


def test_normaliza_e_atualiza_pending(sessao):
    conta = obter_ou_criar_conta(sessao, "ofx", "B", "checking", "n", "1")
    assert upsert_transacoes(sessao, conta, [_reg()]) == (1, 0)
    t = sessao.scalar(select(Transaction))
    assert (t.description_norm, t.installment_n, t.status) == ("streaming alfa", 3, "PENDING")
    assert upsert_transacoes(sessao, conta, [_reg(status="POSTED", amount=-11.0)]) == (0, 1)
    sessao.refresh(t)
    assert (t.status, t.amount) == ("POSTED", -11.0)


def test_parcela_do_registro_tem_prioridade(sessao):
    conta = obter_ou_criar_conta(sessao, "ofx", "B", "checking", "n", "1")
    upsert_transacoes(sessao, conta, [_reg(installment_n=5, installment_total=6)])
    assert sessao.scalar(select(Transaction.installment_n)) == 5


def test_reimportar_nao_duplica_nem_apaga_e_override_sobrevive(sessao):
    importar_ofx(sessao, FIX)
    t = sessao.scalar(select(Transaction).order_by(Transaction.id))
    sessao.add(TransactionOverride(transaction_id=t.id, exclude=True, note="manual"))
    sessao.commit()
    total = sessao.scalar(select(func.count(Transaction.id)))

    assert importar_ofx(sessao, FIX) == (0, total)
    assert sessao.scalar(select(func.count(Transaction.id))) == total
    o = sessao.get(TransactionOverride, t.id)
    assert o.exclude and o.note == "manual"
