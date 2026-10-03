"""Categoria efetiva em camadas e deteccao de transferencias internas. Regras na skill dominio-financeiro.

A categoria efetiva e calculada na leitura (nunca gravada na transacao) para que mudar uma regra valha
retroativamente e o sync possa reescrever a transacao sem perder nada da camada do usuario.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from gastos.core.config import settings
from gastos.domain.models import Category, CategoryRule, Transaction, TransactionOverride
from gastos.domain.normalize import _sem_acento
from gastos.domain.seed import SEM_CATEGORIA, mapear_categoria_pluggy, semear_categorias

NOTA_TRANSFERENCIA = "auto:transferencia interna"
JANELA_TRANSFERENCIA_DIAS = 2


@lru_cache(maxsize=1024)
def _compilar(padrao: str) -> re.Pattern | None:
    """Regex invalida do usuario nao pode derrubar a listagem: vira regra que nunca casa."""
    try:
        return re.compile(padrao, re.IGNORECASE)
    except re.error:
        return None


def categoria_efetiva(tx, override, regras, categorias_por_nome) -> tuple[Category | None, str]:
    """(categoria, fonte) com prioridade override > regra > pluggy > nenhuma. `regras` deve vir ordenada
    por (priority, id); a primeira que casa em description_norm ou description vence. Override so com
    exclude (sem category_id) nao decide a categoria. Sem nada, cai em "Sem categoria"."""
    por_id = {c.id: c for c in categorias_por_nome.values()}
    if override is not None and override.category_id in por_id:
        return por_id[override.category_id], "override"
    for regra in regras:
        rx = _compilar(regra.pattern)
        if (
            rx
            and regra.category_id in por_id
            and (rx.search(tx.description_norm or "") or rx.search(tx.description or ""))
        ):
            return por_id[regra.category_id], "regra"
    nome = mapear_categoria_pluggy(tx.pluggy_category)
    if nome in categorias_por_nome:
        return categorias_por_nome[nome], "pluggy"
    return categorias_por_nome.get(SEM_CATEGORIA), "nenhuma"


def eh_gasto(amount: float, categoria: Category | None, excluida: bool) -> bool:
    """Saida que conta como gasto: nao excluida e fora de categorias kind=transferencia (Investimentos,
    Transferencia), que so movem dinheiro entre bolsos do proprio usuario, e fora de kind=receita (uma
    saida classificada como Receita e estorno ou regra errada; somar como gasto distorce o painel)."""
    return (
        amount < 0
        and not excluida
        and (categoria is None or categoria.kind not in ("transferencia", "receita"))
    )


def categoria_out(categoria: Category | None) -> dict | None:
    """Formato de schemas.CategoryOut, para summary/forecast devolverem dicts prontos para o Pydantic."""
    if categoria is None:
        return None
    return {
        "id": categoria.id,
        "name": categoria.name,
        "kind": categoria.kind,
        "parent_id": categoria.parent_id,
    }


def detectar_transferencias_internas(transacoes) -> set[int]:
    """Ids das transacoes que formam par saida em A / entrada em B (A != B) com o mesmo valor (ao centavo)
    em ate 2 dias. 2 dias cobre D+1 de TED e fatura paga numa noite e lancada no dia util seguinte;
    mais que isso comeca a casar compras e estornos sem relacao. Cada entrada casa com uma saida so
    (a mais antiga primeiro), para dois Pix iguais no mes nao virarem um par so."""
    entradas = defaultdict(list)
    for t in sorted((t for t in transacoes if t.amount > 0), key=lambda t: (t.date, t.id)):
        entradas[round(t.amount * 100)].append(t)
    usadas, pares = set(), set()
    for s in sorted((t for t in transacoes if t.amount < 0), key=lambda t: (t.date, t.id)):
        for e in entradas.get(round(-s.amount * 100), ()):
            if (
                e.id not in usadas
                and e.account_id != s.account_id
                and abs((e.date - s.date).days) <= JANELA_TRANSFERENCIA_DIAS
            ):
                usadas.add(e.id)
                pares |= {s.id, e.id}
                break
    return pares


_TRANSFERENCIA_TXT = re.compile(r"\b(?:pix|ted|doc|transf\w*)\b", re.IGNORECASE)


def detectar_mesma_titularidade(transacoes, nomes: list[str]) -> set[int]:
    """Ids de Pix/TED cuja contraparte e o proprio titular: dinheiro indo para outra conta dele (num
    banco nao conectado, ou conectado mas sem par no prazo). Casa quando todas as palavras com 3+
    letras de um nome configurado aparecem inteiras na descricao normalizada, em qualquer ordem,
    porque cada banco escreve o nome de um jeito (com ou sem o nome do meio). Exige pista de
    transferencia no texto ou na categoria da Pluggy para um comerciante homonimo nao entrar."""
    chaves = [{p for p in _sem_acento(n).lower().split() if len(p) >= 3} for n in nomes]
    chaves = [c for c in chaves if c]
    if not chaves:
        return set()
    achados = set()
    for t in transacoes:
        pluggy = (t.pluggy_category or "").lower()
        if not (_TRANSFERENCIA_TXT.search(t.description or "") or "transfer" in pluggy):
            continue
        bruta = _sem_acento(t.description or "").lower()
        palavras = set((t.description_norm or "").split()) | set(bruta.split())
        if any(c <= palavras for c in chaves):
            achados.add(t.id)
    return achados


def _contexto(sessao: Session):
    overrides = {o.transaction_id: o for o in sessao.scalars(select(TransactionOverride))}
    regras = list(sessao.scalars(select(CategoryRule).order_by(CategoryRule.priority, CategoryRule.id)))
    cats = {c.name: c for c in sessao.scalars(select(Category))}
    return overrides, regras, cats


def categorias_efetivas(sessao: Session, transacoes) -> dict[int, tuple[Category | None, str, bool]]:
    """transaction_id -> (categoria, fonte, excluida) para uma leva de transacoes, com uma consulta so
    por tabela da camada do usuario (overrides, regras, categorias sao pequenas)."""
    overrides, regras, cats = _contexto(sessao)
    out = {}
    for t in transacoes:
        o = overrides.get(t.id)
        cat, fonte = categoria_efetiva(t, o, regras, cats)
        out[t.id] = (cat, fonte, bool(o and o.exclude))
    return out


def recategorizar_tudo(sessao: Session) -> dict[str, int]:
    """Marca transferencias internas com override automatico (categoria Transferencia, exclude) e conta
    as fontes de categoria. Transacao com override manual fica fora da deteccao: a decisao do usuario
    vale mais que a heuristica e o par dela nao deve ser consumido."""
    if not sessao.scalar(select(Category).where(Category.name == "Transferencia")):
        semear_categorias(sessao)
    transf = sessao.scalar(select(Category).where(Category.name == "Transferencia"))
    txs = list(sessao.scalars(select(Transaction)))
    overrides = {o.transaction_id: o for o in sessao.scalars(select(TransactionOverride))}
    candidatas = [t for t in txs if t.id not in overrides or overrides[t.id].note == NOTA_TRANSFERENCIA]

    proprias = detectar_mesma_titularidade(candidatas, settings.nomes_titular)
    pares = detectar_transferencias_internas(candidatas) | proprias
    novos = 0
    for tid in pares:
        if tid not in overrides:
            sessao.add(
                TransactionOverride(
                    transaction_id=tid, category_id=transf.id, exclude=True, note=NOTA_TRANSFERENCIA
                )
            )
            novos += 1
    # Par automatico que deixou de existir (sinal corrigido, transacao atualizada) sai junto, senao a
    # transacao fica excluida dos totais para sempre por uma heuristica que ja nao vale.
    for o in overrides.values():
        if o.note == NOTA_TRANSFERENCIA and o.transaction_id not in pares:
            sessao.delete(o)
    sessao.commit()

    fontes = Counter(fonte for _, fonte, _ in categorias_efetivas(sessao, txs).values())
    return {
        "transacoes": len(txs),
        "transferencias": len(pares),
        "mesma_titularidade": len(proprias),
        "overrides_novos": novos,
        **{f: fontes.get(f, 0) for f in ("override", "regra", "pluggy", "nenhuma")},
    }
