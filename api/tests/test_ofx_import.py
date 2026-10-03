from pathlib import Path

from sqlalchemy import select

from gastos.domain.models import Account, Transaction
from gastos.ingest.ofx_import import importar_ofx

FIX = Path(__file__).parent / "fixtures" / "ofx"


def test_conta_corrente(sessao):
    novas, atualizadas = importar_ofx(sessao, FIX / "conta_corrente.ofx")
    assert (novas, atualizadas) == (9, 0)
    conta = sessao.scalar(select(Account))
    assert (conta.type, conta.external_id, conta.source) == ("checking", "0001", "ofx")
    t = sessao.scalar(select(Transaction).where(Transaction.external_id == "ofx:0001:FIT0002"))
    assert t.amount == -39.90 and t.installment_n == 3 and t.installment_total == 12
    assert t.date.isoformat() == "2026-09-03"
    assert sessao.scalar(select(Transaction).where(Transaction.amount > 0)).amount == 3500.0


def test_cartao_e_credit(sessao):
    importar_ofx(sessao, FIX / "cartao.ofx")
    conta = sessao.scalar(select(Account))
    assert (conta.type, conta.external_id) == ("credit", "CARD0001")
    assert (
        sessao.scalar(select(Transaction).where(Transaction.external_id == "ofx:CARD0001:CCF0001")).amount
        == -199.90
    )


def test_cp1252(sessao, tmp_path):
    texto = (FIX / "conta_corrente.ofx").read_bytes().decode("cp1252").replace("PADARIA BETA", "PADARIA AÇAÍ")
    arq = tmp_path / "banco.ofx"
    arq.write_bytes(texto.encode("cp1252"))
    importar_ofx(sessao, arq)
    assert (
        sessao.scalar(select(Transaction).where(Transaction.description.like("PADARIA A%"))).description
        == "PADARIA AÇAÍ"
    )
