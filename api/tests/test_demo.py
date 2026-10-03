import json
from datetime import date

from sqlalchemy import select

from gastos.domain.categorize import categorias_efetivas
from gastos.domain.demo import CAMINHO_FIXTURE, gerar_dados, popular_demo
from gastos.domain.models import Forecast, Recurrence, Transaction
from gastos.domain.summary import resumo_mensal

HOJE = date(2026, 10, 3)


def test_gerador_e_deterministico_e_bate_com_o_json_versionado():
    assert gerar_dados() == gerar_dados()
    if CAMINHO_FIXTURE.exists():
        assert json.loads(CAMINHO_FIXTURE.read_text(encoding="utf-8")) == gerar_dados()


def test_popular_demo_ponta_a_ponta(sessao):
    r = popular_demo(sessao, hoje=HOJE)
    assert r["transacoes"] > 300
    recs = {x.merchant_norm: x for x in sessao.scalars(select(Recurrence))}
    ativos = {x.kind for x in recs.values() if x.active}
    assert {"assinatura", "parcela", "detectada"} <= ativos

    assert recs["streaming alfa"].kind == "assinatura"
    assert recs["loja beta"].kind == "parcela" and recs["loja beta"].ends_at is not None
    assert recs["aluguel imovel exemplo"].kind == "detectada"
    luz = recs["conta de luz energia exemplo"]
    assert luz.kind == "detectada" and luz.confidence < recs["aluguel imovel exemplo"].confidence
    assert "mercado exemplo" not in recs

    txs = list(sessao.scalars(select(Transaction)))
    efetivas = categorias_efetivas(sessao, txs)
    fatura = [t for t in txs if t.description == "PAGAMENTO RECEBIDO"]
    assert fatura and all(efetivas[t.id][2] and efetivas[t.id][0].name == "Transferencia" for t in fatura)

    metodos = {f.method for f in sessao.scalars(select(Forecast))}
    assert {"recorrencia", "sazonal"} <= metodos
    resumo = resumo_mensal(sessao)
    assert len(resumo["months"]) == 12 and resumo["months"][-1] == "2026-09"

    # rodar de novo nao duplica nada
    popular_demo(sessao, hoje=HOJE)
    assert len(list(sessao.scalars(select(Transaction)))) == len(txs)


def test_demo_desloca_datas_para_terminar_no_mes_anterior_a_hoje(sessao):
    popular_demo(sessao, hoje=date(2027, 3, 15))
    ultima = max(sessao.scalars(select(Transaction.date)))
    assert (ultima.year, ultima.month) == (2027, 2)
