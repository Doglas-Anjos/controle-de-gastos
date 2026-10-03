from datetime import date

from sqlalchemy import func, select

from gastos.domain.demo import carregar
from gastos.domain.forecast import prever
from gastos.domain.models import Account, Category, Forecast, Recurrence
from gastos.domain.recurrence import somar_meses
from gastos.domain.seed import semear_categorias

HOJE = date(2026, 7, 3)


def _mercado(valores_por_mes, primeiro_mes):
    """Duas compras por mes (dias 3 e 20) para nao formar recorrencia; o total do mes e o valor dado."""
    txs = []
    for k, total in enumerate(valores_por_mes):
        m = somar_meses(primeiro_mes, k)
        for dia, parte in ((3, total * 0.4), (20, total * 0.6)):
            txs.append(
                {
                    "conta": "cc",
                    "date": m.replace(day=dia).isoformat(),
                    "description": "COMPRA NO DEBITO MERCADO EXEMPLO",
                    "amount": -round(parte, 2),
                }
            )
    contas = [{"chave": "cc", "bank": "Banco Exemplo", "name": "CC", "type": "checking"}]
    return {"contas": contas, "transacoes": txs}


def _linhas(sessao, nome):
    return {
        (ln["month"]): ln for ln in prever(sessao, HOJE) if ln["category"] and ln["category"]["name"] == nome
    }


def test_tres_meses_de_historico_usa_mediana3(sessao):
    carregar(sessao, _mercado([300, 500, 400], date(2026, 4, 1)))
    semear_categorias(sessao)
    linhas = _linhas(sessao, "Mercado")
    assert sorted(linhas) == ["2026-08", "2026-09", "2026-10"]
    ln = linhas["2026-08"]
    assert (ln["amount"], ln["low"], ln["high"], ln["method"]) == (400.0, 350.0, 450.0, "mediana3")


def test_treze_meses_de_historico_usa_sazonal(sessao):
    valores = [100 + 10 * k for k in range(13)]  # 2025-06 .. 2026-06
    carregar(sessao, _mercado(valores, date(2025, 6, 1)))
    semear_categorias(sessao)
    ln = _linhas(sessao, "Mercado")["2026-08"]
    # mediana3 = 210 (jun/26 ... abr/26); m-12 = ago/25 = 120
    assert ln["method"] == "sazonal" and ln["amount"] == 165.0


def _recorrencia(sessao, **kw):
    semear_categorias(sessao)
    conta = Account(source="demo", bank="Banco Exemplo", type="credit", name="Cartao")
    sessao.add(conta)
    sessao.flush()
    base = {
        "account_id": conta.id,
        "periodicity": "mensal",
        "expected_day": 10,
        "occurrences": 3,
        "confidence": 0.8,
        "active": True,
    }
    base.update(kw)
    sessao.add(Recurrence(**base))
    sessao.commit()


def test_parcela_some_apos_ends_at(sessao):
    _recorrencia(
        sessao,
        merchant_norm="loja beta",
        kind="parcela",
        expected_amount=289.9,
        next_due=date(2026, 8, 10),
        ends_at=date(2026, 9, 10),
        category_id=None,
    )
    compras = sessao.scalar(select(Category).where(Category.name == "Compras"))
    sessao.scalar(select(Recurrence)).category_id = compras.id
    sessao.commit()
    linhas = _linhas(sessao, "Compras")
    assert sorted(linhas) == ["2026-08", "2026-09"]
    assert linhas["2026-08"]["amount"] == 289.9 and linhas["2026-08"]["method"] == "recorrencia"


def test_recorrencia_confirmada_entra_na_parte_fixa_e_cache_e_regravado(sessao):
    semear_categorias(sessao)
    moradia = sessao.scalar(select(Category).where(Category.name == "Moradia"))
    _recorrencia(
        sessao,
        merchant_norm="aluguel imovel exemplo",
        kind="detectada",
        expected_amount=1800.0,
        next_due=date(2026, 8, 6),
        user_decision="confirmada",
        confidence=1.0,
        category_id=moradia.id,
    )
    linhas = _linhas(sessao, "Moradia")
    assert [linhas[m]["amount"] for m in sorted(linhas)] == [1800.0] * 3
    assert all(ln["low"] == ln["high"] == 1800.0 for ln in linhas.values())
    prever(sessao, HOJE)
    assert sessao.scalar(select(func.count()).select_from(Forecast)) == 3


def test_recorrencia_inativa_nao_entra(sessao):
    _recorrencia(
        sessao,
        merchant_norm="streaming alfa",
        kind="assinatura",
        expected_amount=39.9,
        next_due=date(2026, 8, 12),
        active=False,
    )
    assert prever(sessao, HOJE) == []
