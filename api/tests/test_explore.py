"""Explorador por tipo de gasto (skill dominio-financeiro): janela de meses completos, split
cartao/conta/recorrente e extrapolacao pela media. Dados sinteticos da demo."""

from __future__ import annotations

from datetime import date
from statistics import mean

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from gastos.api.main import app
from gastos.core.db import Base, get_session
from gastos.domain.demo import popular_demo
from gastos.domain.explore import projecao, series_mensal
from gastos.domain.models import Category

HOJE = date(2026, 10, 3)


@pytest.fixture
def demo():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    with sessionmaker(bind=eng, expire_on_commit=False)() as s:
        popular_demo(s, hoje=HOJE)
        yield s


def _cat(sessao, nome):
    return sessao.scalar(select(Category).where(Category.name == nome)).id


def test_series_mensal_pura_preenche_meses_vazios_e_separa_partes():
    gastos = [
        (date(2026, 7, 10), 100.0, True, True),
        (date(2026, 7, 20), 50.0, False, False),
        (date(2026, 9, 1), 30.0, False, True),
        (date(2026, 6, 30), 999.0, True, False),  # fora da janela
        (date(2026, 10, 1), 999.0, True, False),  # mes corrente fica de fora
    ]
    serie = series_mensal(gastos, date(2026, 10, 1), 3)
    assert [p["month"] for p in serie] == ["2026-07", "2026-08", "2026-09"]
    assert serie[0] == {"month": "2026-07", "total": 150.0, "card": 100.0, "bank": 50.0, "recurring": 100.0}
    assert serie[1]["total"] == 0.0
    assert serie[2] == {"month": "2026-09", "total": 30.0, "card": 0.0, "bank": 30.0, "recurring": 30.0}


def test_todos_os_gastos_janela_6_e_projecao_pela_media(demo):
    r = projecao(demo, HOJE, None, 6, 3)
    assert r["category"] is None
    assert [p["month"] for p in r["history"]] == [
        "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"
    ]  # fmt: skip
    assert r["mean"] == pytest.approx(mean(p["total"] for p in r["history"]), abs=0.01)
    assert r["last_month"] == r["history"][-1]["total"]
    assert [p["month"] for p in r["projection"]] == ["2026-11", "2026-12", "2027-01"]
    assert all(p["projected"] and p["total"] == r["mean"] for p in r["projection"])
    assert all(p["card"] + p["bank"] == pytest.approx(p["total"], abs=0.02) for p in r["history"])


def test_assinaturas_tudo_no_cartao_e_recorrente(demo):
    r = projecao(demo, HOJE, _cat(demo, "Assinaturas"), 6, 3)
    assert r["category"]["name"] == "Assinaturas"
    for p in r["history"]:
        assert p["total"] > 0 and p["card"] == p["total"] and p["recurring"] == p["total"]


def test_moradia_na_conta_e_recorrente(demo):
    r = projecao(demo, HOJE, _cat(demo, "Moradia"), 6, 3)
    for p in r["history"]:
        assert p["total"] == 1800.0 and p["bank"] == p["total"] and p["card"] == 0.0
        assert p["recurring"] > 0
    assert r["stdev"] == 0.0 and r["trend_pct"] == 0.0


def test_janela_muda_a_media(demo):
    assert projecao(demo, HOJE, None, 3, 3)["mean"] != projecao(demo, HOJE, None, 12, 3)["mean"]


def test_rota_projection_valida_e_404(demo):
    app.dependency_overrides[get_session] = lambda: demo
    try:
        http = TestClient(app)
        r = http.get("/projection", params={"months": 4, "horizon": 2})
        assert r.status_code == 200
        corpo = r.json()
        assert corpo["months_window"] == 4 and len(corpo["history"]) == 4 and len(corpo["projection"]) == 2
        assert http.get("/projection", params={"category_id": 999999}).status_code == 404
        assert http.get("/projection", params={"months": 2}).status_code == 422
        assert http.get("/projection", params={"horizon": 13}).status_code == 422
    finally:
        app.dependency_overrides.clear()
