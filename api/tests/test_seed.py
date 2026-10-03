from sqlalchemy import func, select

from gastos.domain.models import Category, CategoryRule
from gastos.domain.seed import CATEGORIAS_BASE, mapear_categoria_pluggy, semear_categorias


def test_semeia_16_categorias_com_kind_e_e_idempotente(sessao):
    semear_categorias(sessao)
    semear_categorias(sessao)
    cats = {c.name: c.kind for c in sessao.scalars(select(Category))}
    assert len(cats) == 16 == len(CATEGORIAS_BASE)
    assert cats["Moradia"] == "fixo" and cats["Mercado"] == "variavel"
    assert cats["Transferencia"] == "transferencia" and cats["Receita"] == "receita"
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
