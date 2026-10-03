from pathlib import Path

from sqlalchemy import select

from gastos.domain.models import Account, Transaction
from gastos.ingest.csv_import import importar_csv

FIX = Path(__file__).parent / "fixtures" / "csv"


def _por_desc(sessao, trecho):
    return sessao.scalar(select(Transaction).where(Transaction.description.like(f"%{trecho}%")))


def test_nubank_conta_usa_identificador(sessao):
    assert importar_csv(sessao, FIX / "nubank_conta.csv") == (3, 0)
    t = _por_desc(sessao, "MERCADO")
    assert t.external_id == "00000000-0000-4000-8000-000000000101" and t.amount == -45.90
    assert _por_desc(sessao, "EMPRESA").amount == 2500.0


def test_nubank_cartao_inverte_sinal_e_extrai_parcela(sessao):
    importar_csv(sessao, FIX / "nubank_cartao.csv")
    assert sessao.scalar(select(Account)).type == "credit"
    assert _por_desc(sessao, "MERCADO").amount == -58.75
    assert _por_desc(sessao, "Pagamento").amount == 500.0
    t = _por_desc(sessao, "STREAMING")
    assert (t.amount, t.installment_n, t.installment_total) == (-39.90, 3, 12)
    assert t.external_id.startswith("csv:")


def test_generico_ponto_e_virgula_decimal_br_latin1(sessao):
    assert importar_csv(sessao, FIX / "generico_pontovirgula.csv") == (3, 0)
    assert _por_desc(sessao, "MERCADO").amount == -1234.56
    assert _por_desc(sessao, "SALARIO").amount == 3500.0


def test_linhas_identicas_no_mesmo_dia_nao_colidem(sessao, tmp_path):
    arq = tmp_path / "x.csv"
    arq.write_text("Data,Valor,Descricao\n01/09/2026,-5.00,CAFE\n01/09/2026,-5.00,CAFE\n", encoding="utf-8")
    assert importar_csv(sessao, arq) == (2, 0)
    assert importar_csv(sessao, arq) == (0, 2)
