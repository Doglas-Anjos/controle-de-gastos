from sqlalchemy import select

from gastos.api.schemas import SummaryOut
from gastos.domain.categorize import recategorizar_tudo
from gastos.domain.demo import carregar
from gastos.domain.models import Transaction, TransactionOverride
from gastos.domain.seed import semear_categorias
from gastos.domain.summary import resumo_mensal


def _dados():
    contas = [{"chave": "cc", "bank": "Banco Exemplo", "name": "CC", "type": "checking"}]
    t = [
        ("2026-05-05", "SALARIO EMPRESA EXEMPLO", 5000.0),
        ("2026-05-06", "PIX ENVIADO ALUGUEL IMOVEL EXEMPLO", -1800.0),
        ("2026-05-10", "COMPRA NO DEBITO MERCADO EXEMPLO", -250.0),
        ("2026-05-21", "COMPRA NO DEBITO MERCADO EXEMPLO", -150.0),
        ("2026-06-10", "COMPRA NO DEBITO MERCADO EXEMPLO", -300.0),
        ("2026-06-11", "COMPRA NO DEBITO LOJA SEM REGRA", -40.0),
        ("2026-06-12", "APLICACAO CDB EXEMPLO", -1000.0),  # Investimentos (transferencia): fora do gasto
    ]
    return {
        "contas": contas,
        "transacoes": [{"conta": "cc", "date": d, "description": s, "amount": v} for d, s, v in t],
    }


def test_resumo_por_categoria_e_mes(sessao):
    carregar(sessao, _dados())
    semear_categorias(sessao)
    recategorizar_tudo(sessao)
    r = resumo_mensal(sessao, meses=3)
    SummaryOut(**r)  # contrato
    assert r["months"] == ["2026-04", "2026-05", "2026-06"]
    assert r["total_by_month"] == {"2026-04": 0.0, "2026-05": 2200.0, "2026-06": 340.0}
    assert r["income_by_month"]["2026-05"] == 5000.0
    por = {(x["month"], x["category"]["name"]): x["total"] for x in r["by_category"]}
    assert por == {
        ("2026-05", "Moradia"): 1800.0,
        ("2026-05", "Mercado"): 400.0,
        ("2026-06", "Mercado"): 300.0,
        ("2026-06", "Sem categoria"): 40.0,
    }
    assert r["uncategorized"] == {"count": 1, "total": 40.0}


def test_override_exclude_tira_do_resumo(sessao):
    carregar(sessao, _dados())
    semear_categorias(sessao)
    t = sessao.scalar(select(Transaction).where(Transaction.amount == -300.0))
    sessao.add(TransactionOverride(transaction_id=t.id, exclude=True))
    sessao.commit()
    assert resumo_mensal(sessao, meses=1)["total_by_month"] == {"2026-06": 40.0}
