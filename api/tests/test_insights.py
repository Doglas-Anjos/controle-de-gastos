"""Redacao e cliente OpenAI. O teste de vazamento e o mais importante do arquivo: ele e a prova de que
nada identificavel sai para o LLM."""

from __future__ import annotations

import pytest

from gastos.insights import openai_client
from gastos.insights.redact import garantir_sem_sensiveis, montar_resumo

RESUMO = {
    "months": ["2026-01", "2026-02"],
    "by_category": [
        {"month": "2026-01", "category": {"id": 1, "name": "Mercado", "kind": "variavel"}, "total": 812.5},
        {"month": "2026-02", "category": None, "total": 40.0},
    ],
    "total_by_month": {"2026-01": 812.5, "2026-02": 40.0},
    "income_by_month": {"2026-01": 5000.0, "2026-02": 5000.0},
}
RECORRENCIAS = [
    {
        "id": 7,
        "merchant": "streaming alfa",
        "kind": "assinatura",
        "periodicity": "mensal",
        "expected_amount": 39.9,
        "confidence": 0.9,
        "active": True,
        "ends_at": None,
        "category": {"id": 3, "name": "Assinaturas", "kind": "fixo"},
        "account": {"id": 1, "bank": "Banco Exemplo", "name": "Conta", "type": "checking", "source": "ofx"},
    },
    {
        "id": 8,
        "merchant": "antiga",
        "kind": "detectada",
        "periodicity": "mensal",
        "expected_amount": 1,
        "confidence": 0.5,
        "active": False,
        "category": None,
    },
]
PREVISAO = {
    "horizon_months": 1,
    "lines": [
        {
            "month": "2026-03",
            "category": {"id": 1, "name": "Mercado", "kind": "variavel"},
            "amount": 800.0,
            "low": 700.0,
            "high": 900.0,
            "method": "mediana3",
        }
    ],
    "total_by_month": {"2026-03": 839.9},
}


def test_resumo_so_leva_agregados_e_descarta_inativas():
    p = montar_resumo(RESUMO, RECORRENCIAS, PREVISAO)
    assert p["gasto_por_categoria"] == {"Mercado": {"2026-01": 812.5}, "Sem categoria": {"2026-02": 40.0}}
    assert [r["comerciante"] for r in p["recorrencias"]] == ["streaming alfa"]
    assert "account" not in str(p) and "id" not in p["recorrencias"][0]
    garantir_sem_sensiveis(p, {"segredo-xyz"})


def test_pseudonimo_e_estavel_e_esconde_o_nome():
    a = montar_resumo(RESUMO, RECORRENCIAS, PREVISAO, pseudonimizar=True)["recorrencias"][0]["comerciante"]
    b = montar_resumo(RESUMO, RECORRENCIAS, PREVISAO, pseudonimizar=True)["recorrencias"][0]["comerciante"]
    assert a == b and "streaming" not in a


@pytest.mark.parametrize(
    "payload",
    [
        {"ok": 1, "raw_json": {}},
        {"ok": 1, "lista": [{"external_id": "x"}]},
        {"texto": "cpf 000.000.000-00"},
        {"texto": "id 00000000-0000-4000-8000-000000000001"},
        {"texto": "chave segredo-xyz aqui"},
    ],
)
def test_vazamento_e_barrado(payload):
    with pytest.raises(ValueError):
        garantir_sem_sensiveis(payload, {"segredo-xyz"})


def test_sem_chave_openai_levanta_indisponivel(sessao, monkeypatch):
    monkeypatch.setattr(openai_client.settings, "openai_api_key", "")
    with pytest.raises(openai_client.InsightsIndisponivel):
        openai_client.gerar_dicas(sessao, montar_resumo(RESUMO, RECORRENCIAS, PREVISAO))


def test_dicas_usam_cache_na_segunda_chamada(sessao, monkeypatch):
    monkeypatch.setattr(openai_client.settings, "openai_api_key", "sk-xxx-chave-falsa-de-teste-000000")
    chamadas = []

    def falso_chamar(instrucoes, texto, formato):
        chamadas.append(texto)
        return formato.model_validate(
            {"resumo": "ok", "dicas": [{"titulo": "t", "acao": "a", "confianca": 0.5}], "alertas": []}
        )

    monkeypatch.setattr(openai_client, "_chamar", falso_chamar)
    payload = montar_resumo(RESUMO, RECORRENCIAS, PREVISAO)
    r1 = openai_client.gerar_dicas(sessao, payload)
    r2 = openai_client.gerar_dicas(sessao, payload)
    assert len(chamadas) == 1
    assert r1["cache"] is False and r2["cache"] is True
    assert r2["dicas"][0]["titulo"] == "t"
    assert "sk-xxx" not in chamadas[0]
