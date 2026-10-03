"""Dados sinteticos para demo, screenshots e testes. Deterministico (random.Random(42), sem Faker) e com
comerciantes ficticios: nada aqui pode parecer com dado real (skill privacidade-repo).

Cada padrao existe para exercitar uma regra da skill dominio-financeiro: aluguel via Pix (detectada),
STREAMING ALFA no cartao (assinatura), LOJA BETA NN/12 (parcela), luz com cv alto (detectada com
confianca reduzida), mercado aleatorio (nao recorrente) e fatura paga da corrente (transferencia interna).
"""

from __future__ import annotations

import json
import math
import random
from calendar import monthrange
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.domain.categorize import recategorizar_tudo
from gastos.domain.forecast import prever
from gastos.domain.models import Account, Transaction
from gastos.domain.normalize import normalizar
from gastos.domain.recurrence import atualizar_recorrencias, somar_meses
from gastos.domain.seed import semear_categorias

CAMINHO_FIXTURE = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "demo" / "transacoes.json"
INICIO = date(2025, 8, 1)
MESES = 14
CONTAS = [
    {"chave": "corrente", "bank": "Banco Exemplo", "name": "Conta Corrente Exemplo", "type": "checking"},
    {"chave": "cartao", "bank": "Cartao Exemplo", "name": "Cartao Exemplo", "type": "credit"},
]


def gerar_dados(seed: int = 42) -> dict:
    """~14 meses (ago/2025 a set/2026) para 2 contas. Datas fixas para o JSON versionado nao mudar;
    popular_demo desloca tudo para terminar no mes anterior a hoje."""
    rnd = random.Random(seed)
    txs = []

    def add(conta, d, desc, valor, pluggy=None):
        txs.append(
            {
                "conta": conta,
                "date": d.isoformat(),
                "description": desc,
                "amount": round(valor, 2),
                "pluggy_category": pluggy,
            }
        )

    def dias(m, n):
        return sorted(rnd.sample(range(1, monthrange(m.year, m.month)[1] + 1), n))

    cartao_mes_anterior = 0.0
    for k in range(MESES):
        m = somar_meses(INICIO, k)
        inicio_cartao = len(txs)
        add("corrente", m.replace(day=5), "SALARIO EMPRESA EXEMPLO LTDA", 6500.0, "Renda")
        add("corrente", m.replace(day=6), "PIX ENVIADO ALUGUEL IMOVEL EXEMPLO", -1800.0)
        # sazonal (+-25%) + ruido (+-10%): cv ~0.18, acima da tolerancia 0.15 de "valor estavel"
        luz = 180 * (1 + 0.25 * math.cos(2 * math.pi * (m.month - 1) / 12) + rnd.uniform(-0.1, 0.1))
        add("corrente", m.replace(day=15), "CONTA DE LUZ ENERGIA EXEMPLO", -luz, "Eletricidade")
        add("cartao", m.replace(day=12), "STREAMING ALFA", -39.9, "Streaming de vídeo")
        if k >= MESES - 6:  # parcelas 1..6 de 12 vistas; a compra continua depois do fim do historico
            add("cartao", m.replace(day=10), f"LOJA BETA {k - MESES + 7:02d}/12", -289.9, "Compras")
        for d in dias(m, rnd.randint(6, 8)):
            add("corrente", m.replace(day=d), "COMPRA NO DEBITO MERCADO EXEMPLO", -rnd.uniform(35, 420))
        for d in dias(m, rnd.randint(4, 7)):
            nome = rnd.choice(["RESTAURANTE SABOR CASEIRO", "LANCHONETE DELTA", "IFOOD *PIZZARIA OMEGA"])
            add("cartao", m.replace(day=d), nome, -rnd.uniform(25, 120))
        for d in dias(m, rnd.randint(1, 3)):
            add(
                "corrente",
                m.replace(day=d),
                "COMPRA NO DEBITO DROGARIA EXEMPLO",
                -rnd.uniform(20, 150),
                "Farmácia",
            )
        for d in dias(m, rnd.randint(5, 10)):
            add("cartao", m.replace(day=d), "UBER *TRIP", -rnd.uniform(12, 60))
        for d in dias(m, 2):
            add("cartao", m.replace(day=d), "POSTO EXEMPLO COMBUSTIVEL", -rnd.uniform(150, 250))
        if cartao_mes_anterior:  # fatura do mes anterior paga da corrente: par de transferencia interna
            add("corrente", m.replace(day=8), "PAGAMENTO FATURA CARTAO EXEMPLO", -cartao_mes_anterior)
            add("cartao", m.replace(day=9), "PAGAMENTO RECEBIDO", cartao_mes_anterior)
        cartao_mes_anterior = round(
            -sum(t["amount"] for t in txs[inicio_cartao:] if t["conta"] == "cartao" and t["amount"] < 0), 2
        )

    txs.sort(key=lambda t: (t["date"], t["conta"], t["description"]))
    for i, t in enumerate(txs, 1):
        t["external_id"] = f"demo-{i:05d}"
    return {"seed": seed, "contas": CONTAS, "transacoes": txs}


def carregar(sessao: Session, dados: dict) -> dict[str, int]:
    """Insere contas e transacoes do formato de gerar_dados (tambem usado pelos testes com dados pequenos).
    Idempotente por external_id. description_norm e parcela vem de normalizar(), como na ingestao real."""
    contas = {}
    for c in dados["contas"]:
        ext = f"demo-{c['chave']}"
        conta = sessao.scalar(select(Account).where(Account.external_id == ext))
        if conta is None:
            conta = Account(source="demo", bank=c["bank"], type=c["type"], name=c["name"], external_id=ext)
            sessao.add(conta)
        contas[c["chave"]] = conta
    sessao.flush()

    existentes = set(sessao.scalars(select(Transaction.external_id)))
    novas = 0
    for i, t in enumerate(dados["transacoes"]):
        ext = t.get("external_id") or f"demo-{t['conta']}-{t['date']}-{i}-{t['description']}"[:120]
        if ext in existentes:
            continue
        norm = normalizar(t["description"])
        sessao.add(
            Transaction(
                account_id=contas[t["conta"]].id,
                external_id=ext,
                date=date.fromisoformat(t["date"]),
                description=t["description"],
                description_norm=norm.description_norm,
                amount=t["amount"],
                type="CREDIT" if t["amount"] > 0 else "DEBIT",
                pluggy_category=t.get("pluggy_category"),
                installment_n=norm.installment_n,
                installment_total=norm.installment_total,
            )
        )
        existentes.add(ext)
        novas += 1
    sessao.commit()
    return {"contas": len(contas), "transacoes": novas}


def _deslocar(dados: dict, hoje: date) -> dict:
    """Move as datas em meses inteiros para o ultimo mes do historico ser o anterior ao de hoje; assim a
    demo sempre tem recorrencias ativas e previsao para os proximos meses."""
    ultima = max(date.fromisoformat(t["date"]) for t in dados["transacoes"])
    delta = (hoje.year * 12 + hoje.month - 1) - (ultima.year * 12 + ultima.month)
    txs = [
        {**t, "date": somar_meses(date.fromisoformat(t["date"]), delta).isoformat()}
        for t in dados["transacoes"]
    ]
    return {**dados, "transacoes": txs}


def popular_demo(sessao: Session, hoje: date | None = None) -> dict:
    """Carrega a fixture versionada (ou gera em memoria se ela nao estiver no ambiente, ex.: imagem
    Docker sem tests/), semeia categorias e roda categorizacao, recorrencias e previsao."""
    hoje = hoje or date.today()
    if CAMINHO_FIXTURE.exists():
        dados = json.loads(CAMINHO_FIXTURE.read_text(encoding="utf-8"))
    else:
        dados = gerar_dados()
    carregado = carregar(sessao, _deslocar(dados, hoje))
    semear_categorias(sessao)
    categorias = recategorizar_tudo(sessao)
    recorrentes = atualizar_recorrencias(sessao, hoje)
    previsao = prever(sessao, hoje)
    return {
        "transacoes": carregado["transacoes"],
        "transferencias": categorias["transferencias"],
        "transacoes_recorrentes": len(recorrentes),
        "linhas_previsao": len(previsao),
    }
