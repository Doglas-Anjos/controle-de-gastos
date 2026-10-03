"""Rotas que dependem do dominio, exercitadas sobre a demo sintetica (ponta a ponta sem rede)."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from gastos.api.main import app
from gastos.core.db import Base, get_session
from gastos.domain.demo import popular_demo
from gastos.insights import openai_client

HOJE = date(2026, 10, 3)


@pytest.fixture
def http():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    with sessionmaker(bind=eng, expire_on_commit=False)() as s:
        popular_demo(s, hoje=HOJE)
        app.dependency_overrides[get_session] = lambda: s
        yield TestClient(app)
        app.dependency_overrides.clear()


def test_transacoes_paginadas_com_categoria_e_filtros(http):
    r = http.get("/transactions", params={"page_size": 20}).json()
    assert r["total"] > 100 and len(r["items"]) == 20
    item = r["items"][0]
    assert set(item) >= {"category", "category_source", "excluded", "installment", "recurrence_id"}
    assert "raw_json" not in item and "external_id" not in item
    cat_id = next(i["category"]["id"] for i in r["items"] if i["category"])
    filtrado = http.get("/transactions", params={"category_id": cat_id}).json()
    assert filtrado["total"] > 0 and all(i["category"]["id"] == cat_id for i in filtrado["items"])
    parcela = http.get("/transactions", params={"q": "loja beta"}).json()["items"][0]
    assert parcela["installment"] and "/" in parcela["installment"]


def test_summary_recorrencias_e_previsao(http):
    s = http.get("/summary", params={"months": 6}).json()
    assert len(s["months"]) == 6 and s["total_by_month"] and s["income_by_month"]

    recs = http.get("/recurrences", params={"active": True}).json()
    assert {r["kind"] for r in recs} == {"assinatura", "parcela", "detectada"}
    assert all("account" in r and "bank" in r["account"] for r in recs)

    detectada = next(r for r in recs if r["kind"] == "detectada")
    r = http.post(f"/recurrences/{detectada['id']}/decision", json={"decision": "descartada"}).json()
    assert r["active"] is False and r["user_decision"] == "descartada"
    assert http.post("/recurrences/999999/decision", json={"decision": "confirmada"}).status_code == 404
    assert (
        http.post(f"/recurrences/{detectada['id']}/decision", json={"decision": "talvez"}).status_code == 422
    )

    f = http.get("/forecast", params={"horizon": 2}).json()
    assert f["horizon_months"] == 2 and len(f["total_by_month"]) == 2
    assert {ln["method"] for ln in f["lines"]} <= {"recorrencia", "mediana3", "sazonal"}


def test_categorias_e_recalculo(http):
    cats = http.get("/categories").json()
    assert {c["name"] for c in cats} >= {"Mercado", "Assinaturas", "Transferencia"}
    r = http.post("/recalculate").json()
    assert r["linhas_previsao"] > 0


def test_insights_sem_chave_e_409_e_com_chave_falsa_usa_payload_redigido(http, monkeypatch):
    monkeypatch.setattr(openai_client.settings, "openai_api_key", "")
    assert http.get("/insights").status_code == 409
    assert http.post("/insights/perguntar", json={"pergunta": "quanto gasto?"}).status_code == 409

    monkeypatch.setattr(openai_client.settings, "openai_api_key", "sk-xxx-chave-falsa-de-teste-000000")
    capturado = {}

    def falso(instrucoes, texto, formato):
        capturado["texto"] = texto
        return formato.model_validate(
            {"resumo": "r", "dicas": [{"titulo": "t", "acao": "a", "confianca": 0.9}], "alertas": ["x"]}
            if formato.__name__ == "RelatorioDicas"
            else {"resposta": "ok"}
        )

    monkeypatch.setattr(openai_client, "_chamar", falso)
    d = http.get("/insights").json()
    assert d["dicas"][0]["titulo"] == "t" and d["cache"] is False
    assert http.get("/insights").json()["cache"] is True
    assert "external_id" not in capturado["texto"] and "raw_json" not in capturado["texto"]
    assert "streaming alfa" in capturado["texto"]
    assert http.post("/insights/perguntar", json={"pergunta": "quanto gasto?"}).json()["resposta"] == "ok"
