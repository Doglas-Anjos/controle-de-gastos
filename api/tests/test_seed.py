from sqlalchemy import func, select

from gastos.domain.models import Category, CategoryRule
from gastos.domain.seed import (
    CATEGORIAS_BASE,
    REGRAS_RETIRADAS,
    SUBCATEGORIAS_BASE,
    mapear_categoria_pluggy,
    semear_categorias,
)


def test_semeia_27_categorias_com_kind_e_e_idempotente(sessao):
    semear_categorias(sessao)
    semear_categorias(sessao)
    cats = {c.name: c.kind for c in sessao.scalars(select(Category))}
    assert len(cats) == 27 == len(CATEGORIAS_BASE) + len(SUBCATEGORIAS_BASE)
    assert cats["Moradia"] == "fixo" and cats["Mercado"] == "variavel"
    assert cats["Transferencia"] == "transferencia" and cats["Receita"] == "receita"
    por_nome = {c.name: c for c in sessao.scalars(select(Category))}
    assert por_nome["Salario"].parent_id == por_nome["Receita"].id and por_nome["Salario"].kind == "receita"
    assert por_nome["Renda fixa"].parent_id == por_nome["Investimentos"].id
    n_regras = sessao.scalar(select(func.count()).select_from(CategoryRule))
    semear_categorias(sessao)
    assert sessao.scalar(select(func.count()).select_from(CategoryRule)) == n_regras > 0


def test_mapeamento_pluggy_ignora_acento_e_caixa():
    assert mapear_categoria_pluggy("Supermercado") == "Mercado"
    assert mapear_categoria_pluggy("Saúde") == "Saude"
    assert mapear_categoria_pluggy("SERVIÇOS") == "Contas e servicos"
    assert mapear_categoria_pluggy("Transferência mesma titularidade") == "Transferencia"
    assert mapear_categoria_pluggy("Categoria Inventada") is None
    assert mapear_categoria_pluggy(None) is None


def test_mapeia_pagamento_de_fatura_investimento_automatico_e_universidade():
    assert mapear_categoria_pluggy("Credit card payment") == "Transferencia"
    assert mapear_categoria_pluggy("Automatic investment") == "Investimentos"
    assert mapear_categoria_pluggy("University") == "Educacao"
    assert mapear_categoria_pluggy("Tax on financial operations") == "Impostos e taxas"
    assert mapear_categoria_pluggy("Proceeds interests and dividends") == "Receita"
    assert mapear_categoria_pluggy("Supermarkets") == "Mercado"
    assert mapear_categoria_pluggy("Fixed income") == "Renda fixa"
    assert mapear_categoria_pluggy("Salary") == "Salario"
    assert mapear_categoria_pluggy("Loans and financing") == "Emprestimos"
    assert mapear_categoria_pluggy("Taxi and ride-hailing") == "Aplicativos"
    assert mapear_categoria_pluggy("Gas stations") == "Combustivel"
    assert mapear_categoria_pluggy("Transportation") == "Locomocao"


def test_categoria_renomeada_mantem_id_e_vira_mae(sessao):
    antiga = Category(name="Transporte", kind="variavel")
    sessao.add(antiga)
    sessao.commit()
    semear_categorias(sessao)
    por_nome = {c.name: c for c in sessao.scalars(select(Category))}
    assert "Transporte" not in por_nome and por_nome["Locomocao"].id == antiga.id
    assert por_nome["Combustivel"].parent_id == antiga.id


def test_categoria_renomeada_e_fundida_quando_as_duas_existem(sessao):
    semear_categorias(sessao)
    nova = sessao.scalar(select(Category).where(Category.name == "Locomocao"))
    velha = Category(name="Transporte", kind="variavel")
    sessao.add(velha)
    sessao.flush()
    sessao.add(CategoryRule(pattern="onibus", category_id=velha.id, priority=1))
    sessao.commit()
    semear_categorias(sessao)
    assert sessao.scalar(select(Category).where(Category.name == "Transporte")) is None
    assert sessao.scalar(select(CategoryRule).where(CategoryRule.pattern == "onibus")).category_id == nova.id


def test_regra_retirada_e_apagada_no_proximo_seed(sessao):
    semear_categorias(sessao)
    cat = sessao.scalar(select(Category).where(Category.name == "Receita"))
    sessao.add(CategoryRule(pattern=next(iter(REGRAS_RETIRADAS)), category_id=cat.id, priority=1))
    sessao.commit()
    semear_categorias(sessao)
    padroes = set(sessao.scalars(select(CategoryRule.pattern)))
    assert not padroes & REGRAS_RETIRADAS and r"\b(?:rendimento|dividendo|jcp)\b" in padroes
