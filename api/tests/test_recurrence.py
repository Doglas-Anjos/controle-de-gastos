import random
from datetime import date, timedelta

from sqlalchemy import select

from gastos.domain.demo import carregar
from gastos.domain.models import Recurrence
from gastos.domain.recurrence import (
    TxRecorrencia,
    atualizar_recorrencias,
    detectar_recorrencias,
    somar_meses,
    transacoes_recorrentes,
)

HOJE = date(2026, 7, 3)
TIPOS = {1: "checking", 2: "credit"}


def _mensal(nome, conta, valores, inicio=date(2026, 1, 12), parcela_inicial=None, total=None):
    out = []
    for k, v in enumerate(valores):
        n = parcela_inicial + k if parcela_inicial else None
        out.append(TxRecorrencia(len(out) + 1, conta, somar_meses(inicio, k), -v, nome, n, total))
    return out


def _unica(txs, hoje=HOJE):
    rs = detectar_recorrencias(txs, TIPOS, hoje)
    assert len(rs) == 1, rs
    return rs[0]


def test_assinatura_mensal_estavel_no_cartao():
    r = _unica(_mensal("streaming alfa", 2, [39.9] * 6))
    assert (r.kind, r.periodicity, r.expected_amount, r.expected_day) == ("assinatura", "mensal", 39.9, 12)
    assert r.next_due == date(2026, 7, 12) and r.active
    assert r.confidence == 0.8  # min(1, 0.5 + 0.1*3) * 1.0


def test_parcela_3_de_12_com_fim_calculado():
    r = _unica(_mensal("loja beta", 2, [289.9] * 3, inicio=date(2026, 4, 10), parcela_inicial=1, total=12))
    assert r.kind == "parcela" and r.expected_amount == 289.9
    assert r.next_due == date(2026, 7, 10)
    assert r.ends_at == date(2027, 3, 10)  # ultima vista 3/12 em 2026-06-10 + 9 meses


def test_pix_mensal_com_valor_igual_vira_detectada():
    r = _unica(_mensal("aluguel imovel exemplo", 1, [1800.0] * 5))
    assert (r.kind, r.periodicity) == ("detectada", "mensal")
    assert r.confidence == 0.7


def test_conta_de_luz_com_cv_alto_vira_detectada_com_confianca_reduzida():
    r = _unica(_mensal("conta de luz energia exemplo", 1, [120, 210, 150, 260, 140, 230]))
    assert r.kind == "detectada"
    assert abs(r.confidence - 0.8 * 0.7) < 1e-9


def test_luz_no_cartao_sem_valor_estavel_nao_e_assinatura():
    assert _unica(_mensal("energia exemplo", 2, [120, 210, 150, 260, 140, 230])).kind == "detectada"


def test_compras_aleatorias_no_mesmo_mercado_nao_sao_recorrentes():
    rnd = random.Random(7)
    txs, d = [], date(2026, 1, 1)
    for i in range(40):
        d += timedelta(days=rnd.randint(0, 9))
        txs.append(TxRecorrencia(i, 1, d, -round(rnd.uniform(30, 400), 2), "mercado exemplo"))
    assert detectar_recorrencias(txs, TIPOS, HOJE) == []


def test_mediana_semanal_por_acaso_mas_irregular_nao_e_recorrente():
    gaps, d, txs = [2, 7, 12, 7, 3, 7, 14, 7, 1], date(2026, 1, 1), []
    for i, g in enumerate([0, *gaps]):
        d += timedelta(days=g)
        txs.append(TxRecorrencia(i, 1, d, -40.0, "lanchonete delta"))
    assert detectar_recorrencias(txs, TIPOS, HOJE) == []


def test_mes_pulado_continua_mensal():
    txs = _mensal("aluguel", 1, [1800.0] * 6)
    r = _unica(txs[:2] + txs[3:])
    assert r.periodicity == "mensal" and r.occurrences == 5


def test_menos_de_3_ocorrencias_e_entradas_sao_ignoradas():
    assert detectar_recorrencias(_mensal("x", 1, [10, 10]), TIPOS, HOJE) == []
    salario = [TxRecorrencia(i, 1, somar_meses(date(2026, 1, 5), i), 5000.0, "salario") for i in range(6)]
    assert detectar_recorrencias(salario, TIPOS, HOJE) == []


def test_encerrada_apos_2_intervalos_sem_ocorrencia():
    r = _unica(_mensal("streaming alfa", 2, [39.9] * 4, inicio=date(2026, 1, 12)))  # ultima 2026-04-12
    assert not r.active
    assert _unica(_mensal("streaming alfa", 2, [39.9] * 4, inicio=date(2026, 3, 12))).active


# ---------- persistencia ----------


def _dados(meses, inicio=date(2026, 1, 12)):
    contas = [{"chave": "cartao", "bank": "Cartao Exemplo", "name": "Cartao", "type": "credit"}]
    txs = [
        {
            "conta": "cartao",
            "date": somar_meses(inicio, k).isoformat(),
            "description": "STREAMING ALFA",
            "amount": -39.9,
        }
        for k in range(meses)
    ]
    return {"contas": contas, "transacoes": txs}


def test_atualizar_persiste_e_mapeia_transacoes(sessao):
    carregar(sessao, _dados(6))
    mapa = atualizar_recorrencias(sessao, HOJE)
    rec = sessao.scalar(select(Recurrence))
    assert (rec.kind, rec.active, rec.occurrences) == ("assinatura", True, 6)
    assert len(mapa) == 6 and set(mapa.values()) == {rec.id}
    assert transacoes_recorrentes(sessao) == mapa


def test_descartada_nunca_volta(sessao):
    carregar(sessao, _dados(4))
    atualizar_recorrencias(sessao, HOJE)
    rec = sessao.scalar(select(Recurrence))
    rec.user_decision, rec.active = "descartada", False
    sessao.commit()
    carregar(sessao, _dados(2, inicio=date(2026, 5, 12)))
    mapa = atualizar_recorrencias(sessao, HOJE)
    rec = sessao.scalar(select(Recurrence))
    assert (rec.active, rec.user_decision) == (False, "descartada")
    assert mapa == {}


def test_confirmada_fica_ativa_com_confianca_1_e_nao_confirmada_encerra(sessao):
    carregar(sessao, _dados(4))
    atualizar_recorrencias(sessao, HOJE)
    depois = date(2026, 12, 1)
    atualizar_recorrencias(sessao, depois)
    rec = sessao.scalar(select(Recurrence))
    assert rec.active is False  # encerrada
    rec.user_decision = "confirmada"
    sessao.commit()
    atualizar_recorrencias(sessao, depois)
    rec = sessao.scalar(select(Recurrence))
    assert (rec.active, rec.confidence) == (True, 1.0)
