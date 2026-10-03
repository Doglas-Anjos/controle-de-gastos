"""Catalogacao pelo LLM: o payload leva categorias e grupos sem categoria (sem transacao individual),
o modelo so propoe e `aplicar_acoes` grava o que o usuario aprovou."""

from __future__ import annotations

from sqlalchemy import select

from gastos.domain.catalogo import PRIORIDADE_IA, aplicar_acoes
from gastos.domain.categorize import categorias_efetivas
from gastos.domain.demo import carregar
from gastos.domain.models import Category, CategoryRule, Transaction
from gastos.domain.seed import semear_categorias
from gastos.domain.summary import grupos_sem_categoria
from gastos.insights import openai_client
from gastos.insights.redact import garantir_sem_sensiveis, montar_resumo
from tests.test_insights import PREVISAO, RECORRENCIAS, RESUMO

PEND = {
    "descricao": "auxilio pesquisa exemplo",
    "origem": "conta corrente",
    "fluxo": "entrada",
    "n": 2,
    "total": 2400.0,
    "ultima": "2026-07-05",
}


def _dados():
    contas = [
        {"chave": "cc", "bank": "Banco Exemplo", "name": "CC", "type": "checking"},
        {"chave": "cartao", "bank": "Banco Exemplo", "name": "Cartao", "type": "credit"},
    ]
    t = [
        ("cc", "2026-06-05", "PIX RECEBIDO AUXILIO PESQUISA EXEMPLO", 1200.0),
        ("cc", "2026-07-05", "PIX RECEBIDO AUXILIO PESQUISA EXEMPLO", 1200.0),
        ("cc", "2026-07-10", "PIX ENVIADO ACADEMIA CORPO EXEMPLO", -120.0),
        ("cartao", "2026-07-12", "LOJA DE JOGOS EXEMPLO", -89.0),
        ("cc", "2026-07-15", "COMPRA NO DEBITO MERCADO EXEMPLO", -250.0),  # regra seed: fora
    ]
    txs = [{"conta": c, "date": d, "description": s, "amount": v} for c, d, s, v in t]
    return {"contas": contas, "transacoes": txs}


def test_grupos_sem_categoria_agrupa_por_descricao_e_origem(sessao):
    carregar(sessao, _dados())
    semear_categorias(sessao)
    grupos = grupos_sem_categoria(sessao, meses=3)
    por_desc = {g["descricao"]: g for g in grupos}
    assert "mercado exemplo" not in str(por_desc)  # ja categorizada pela regra seed
    bolsa = por_desc["auxilio pesquisa exemplo"]
    assert (bolsa["origem"], bolsa["fluxo"], bolsa["n"]) == ("conta corrente", "entrada", 2)
    assert bolsa["total"] == 2400.0
    assert por_desc["loja de jogos exemplo"]["origem"] == "cartao"
    assert grupos[0] is bolsa  # maior total primeiro
    assert all(set(g) == {"descricao", "origem", "fluxo", "n", "total", "ultima"} for g in grupos)


def test_payload_leva_categorias_e_pendentes_e_passa_na_redacao():
    cats = [
        {"id": 1, "name": "Receita", "kind": "receita", "parent_id": None},
        {"id": 2, "name": "Bolsa", "kind": "receita", "parent_id": 1},
    ]
    p = montar_resumo(RESUMO, RECORRENCIAS, PREVISAO, categorias=cats, pendentes=[PEND])
    assert p["categorias"][1] == {"nome": "Bolsa", "tipo": "receita", "dentro_de": "Receita"}
    assert p["sem_categoria"] == [PEND] and "legenda" in p
    garantir_sem_sensiveis(p)
    ps = montar_resumo(RESUMO, RECORRENCIAS, PREVISAO, pseudonimizar=True, categorias=cats, pendentes=[PEND])
    assert "auxilio" not in ps["sem_categoria"][0]["descricao"]


def test_aplicar_cria_categoria_e_regra_e_ignora_invalidas(sessao):
    carregar(sessao, _dados())
    semear_categorias(sessao)
    acoes = [
        {"tipo": "criar_categoria", "nome": "Academia", "mae": "Saude", "kind": "fixo"},  # kind herdado
        {"tipo": "criar_categoria", "nome": "Jogos", "kind": "variavel"},
        {"tipo": "criar_categoria", "nome": "", "kind": "fixo"},
        {"tipo": "categorizar", "descricao": "auxilio pesquisa exemplo", "categoria": "bolsa"},
        {"tipo": "categorizar", "descricao": "academia corpo exemplo", "categoria": "Academia"},
        {"tipo": "categorizar", "descricao": "loja de jogos exemplo", "categoria": "Jogos"},
        {"tipo": "categorizar", "descricao": "x", "categoria": "Inexistente"},
    ]
    r = aplicar_acoes(sessao, acoes)
    assert (r["categorias_criadas"], r["regras_criadas"], len(r["ignoradas"])) == (2, 3, 2)
    academia = sessao.scalar(select(Category).where(Category.name == "Academia"))
    saude = sessao.scalar(select(Category).where(Category.name == "Saude"))
    assert (academia.kind, academia.parent_id) == ("variavel", saude.id)
    regra = sessao.scalar(select(CategoryRule).where(CategoryRule.category_id == academia.id))
    assert regra.priority == PRIORIDADE_IA and regra.pattern == r"^academia\ corpo\ exemplo$"

    txs = list(sessao.scalars(select(Transaction)))
    nomes = {t.description: categorias_efetivas(sessao, txs)[t.id][0].name for t in txs}
    assert nomes["PIX RECEBIDO AUXILIO PESQUISA EXEMPLO"] == "Bolsa"
    assert nomes["LOJA DE JOGOS EXEMPLO"] == "Jogos"
    assert grupos_sem_categoria(sessao) == []
    # mudar a categoria da mesma descricao atualiza a regra em vez de duplicar
    troca = {"tipo": "categorizar", "descricao": "loja de jogos exemplo", "categoria": "Lazer"}
    assert aplicar_acoes(sessao, [troca])["regras_criadas"] == 1
    lazer = sessao.scalar(select(Category).where(Category.name == "Lazer"))
    padrao = r"^loja\ de\ jogos\ exemplo$"
    jogos = list(sessao.scalars(select(CategoryRule).where(CategoryRule.pattern == padrao)))
    assert len(jogos) == 1 and jogos[0].category_id == lazer.id


def test_catalogar_usa_cache_e_pula_sem_pendentes(sessao, monkeypatch):
    monkeypatch.setattr(openai_client.settings, "openai_api_key", "sk-xxx-chave-falsa-de-teste-000000")
    chamadas = []

    def falso_chamar(instrucoes, texto, formato):
        chamadas.append(texto)
        acao = {"tipo": "categorizar", "descricao": PEND["descricao"], "categoria": "Bolsa", "confianca": 0.8}
        sugestao = {"nome": None, "kind": None, "mae": None, "motivo": None, **acao}
        return formato.model_validate({"sugestoes": [sugestao]})

    monkeypatch.setattr(openai_client, "_chamar", falso_chamar)
    payload = montar_resumo(RESUMO, RECORRENCIAS, PREVISAO, pendentes=[PEND])
    r1 = openai_client.catalogar(sessao, payload)
    r2 = openai_client.catalogar(sessao, payload)
    assert len(chamadas) == 1 and r1["cache"] is False and r2["cache"] is True
    assert r2["sugestoes"][0]["categoria"] == "Bolsa"
    assert "sem_categoria" in chamadas[0] and "legenda" in chamadas[0]
    vazio = openai_client.catalogar(sessao, montar_resumo(RESUMO, RECORRENCIAS, PREVISAO))
    assert vazio["sugestoes"] == [] and len(chamadas) == 1
