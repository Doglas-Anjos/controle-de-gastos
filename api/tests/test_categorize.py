from datetime import date
from types import SimpleNamespace as NS

from sqlalchemy import select

from gastos.domain.categorize import (
    categoria_efetiva,
    categorias_efetivas,
    detectar_transferencias_internas,
    recategorizar_tudo,
)
from gastos.domain.demo import carregar
from gastos.domain.models import Category, CategoryRule, Transaction, TransactionOverride
from gastos.domain.seed import semear_categorias
from gastos.domain.summary import resumo_mensal


def _cats():
    nomes = {"Assinaturas": "fixo", "Lazer": "variavel", "Mercado": "variavel", "Sem categoria": "variavel"}
    return {n: Category(id=i, name=n, kind=k) for i, (n, k) in enumerate(nomes.items(), 1)}


def _tx(desc="netflix com", pluggy="Supermercado"):
    return NS(description=desc.upper(), description_norm=desc, pluggy_category=pluggy)


def test_prioridade_override_regra_pluggy_nenhuma():
    cats = _cats()
    regras = [CategoryRule(id=1, pattern=r"\bnetflix\b", category_id=cats["Assinaturas"].id, priority=10)]
    override = TransactionOverride(transaction_id=1, category_id=cats["Lazer"].id, exclude=False)

    assert categoria_efetiva(_tx(), override, regras, cats) == (cats["Lazer"], "override")
    assert categoria_efetiva(_tx(), None, regras, cats) == (cats["Assinaturas"], "regra")
    assert categoria_efetiva(_tx("loja x"), None, regras, cats) == (cats["Mercado"], "pluggy")
    assert categoria_efetiva(_tx("loja x", None), None, regras, cats) == (cats["Sem categoria"], "nenhuma")
    # override so de exclusao (sem categoria) nao esconde a regra
    so_exclui = TransactionOverride(transaction_id=1, category_id=None, exclude=True)
    assert categoria_efetiva(_tx(), so_exclui, regras, cats) == (cats["Assinaturas"], "regra")


def test_regra_invalida_e_ignorada_e_menor_priority_vence():
    cats = _cats()
    regras = [
        CategoryRule(id=1, pattern="(", category_id=cats["Lazer"].id, priority=1),
        CategoryRule(id=2, pattern="netflix", category_id=cats["Assinaturas"].id, priority=5),
        CategoryRule(id=3, pattern="netflix", category_id=cats["Lazer"].id, priority=9),
    ]
    assert categoria_efetiva(_tx(), None, regras, cats)[0] is cats["Assinaturas"]


def test_detecta_par_de_transferencia_em_ate_2_dias_em_contas_diferentes():
    txs = [
        NS(id=1, account_id=1, date=date(2026, 1, 8), amount=-1500.0),
        NS(id=2, account_id=2, date=date(2026, 1, 10), amount=1500.0),
        NS(id=3, account_id=1, date=date(2026, 2, 8), amount=-900.0),
        NS(id=4, account_id=2, date=date(2026, 2, 11), amount=900.0),  # 3 dias: fora
        NS(id=5, account_id=1, date=date(2026, 3, 1), amount=-50.0),
        NS(id=6, account_id=1, date=date(2026, 3, 1), amount=50.0),  # mesma conta: estorno, nao transferencia
    ]
    assert detectar_transferencias_internas(txs) == {1, 2}


def _dados_transferencia():
    contas = [
        {"chave": "cc", "bank": "Banco Exemplo", "name": "CC", "type": "checking"},
        {"chave": "cartao", "bank": "Cartao Exemplo", "name": "Cartao", "type": "credit"},
    ]
    txs = [
        {
            "conta": "cc",
            "date": "2026-01-08",
            "description": "PAGAMENTO FATURA CARTAO EXEMPLO",
            "amount": -1500.0,
        },
        {"conta": "cartao", "date": "2026-01-09", "description": "PAGAMENTO RECEBIDO", "amount": 1500.0},
        {"conta": "cc", "date": "2026-01-05", "description": "SALARIO EMPRESA EXEMPLO", "amount": 5000.0},
        {
            "conta": "cc",
            "date": "2026-01-12",
            "description": "COMPRA NO DEBITO MERCADO EXEMPLO",
            "amount": -200.0,
        },
    ]
    return {"contas": contas, "transacoes": txs}


def test_transferencia_interna_vira_override_auto_excluido_dos_totais(sessao):
    carregar(sessao, _dados_transferencia())
    semear_categorias(sessao)
    r = recategorizar_tudo(sessao)
    assert r["transferencias"] == 2
    overrides = list(sessao.scalars(select(TransactionOverride)))
    assert len(overrides) == 2 and all(
        o.exclude and o.note == "auto:transferencia interna" for o in overrides
    )

    txs = list(sessao.scalars(select(Transaction)))
    efetivas = categorias_efetivas(sessao, txs)
    por_desc = {t.description: efetivas[t.id] for t in txs}
    cat, fonte, excluida = por_desc["PAGAMENTO RECEBIDO"]
    assert (cat.name, fonte, excluida) == ("Transferencia", "override", True)
    assert por_desc["COMPRA NO DEBITO MERCADO EXEMPLO"][0].name == "Mercado"

    resumo = resumo_mensal(sessao)
    assert resumo["total_by_month"]["2026-01"] == 200.0
    assert resumo["income_by_month"]["2026-01"] == 5000.0
    # idempotente
    assert recategorizar_tudo(sessao)["overrides_novos"] == 0


def test_override_manual_nao_e_sobrescrito(sessao):
    carregar(sessao, _dados_transferencia())
    semear_categorias(sessao)
    lazer = sessao.scalar(select(Category).where(Category.name == "Lazer"))
    t = sessao.scalar(select(Transaction).where(Transaction.description == "PAGAMENTO RECEBIDO"))
    sessao.add(TransactionOverride(transaction_id=t.id, category_id=lazer.id, exclude=False, note="minha"))
    sessao.commit()
    recategorizar_tudo(sessao)
    o = sessao.get(TransactionOverride, t.id)
    assert (o.category_id, o.exclude, o.note) == (lazer.id, False, "minha")
