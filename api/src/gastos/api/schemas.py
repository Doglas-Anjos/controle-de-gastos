"""Contrato da API (Pydantic). O frontend tipa contra estes modelos; mude aqui antes do router ou da tela.

Nenhum schema expoe raw_json, external_id de transacao, ids de item/conta da Pluggy ou credenciais.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class AccountOut(BaseModel):
    id: int
    bank: str
    name: str
    type: str  # checking | credit | savings
    source: str  # pluggy | ofx | csv
    last_sync_at: datetime | None = None
    hint: str | None = None  # marketingName, bandeira ou "final 1234"; nunca numero inteiro de conta


class AccountUpdate(BaseModel):
    """Renomear conta/banco quando a origem veio generica (ex.: conector MeuPluggy)."""

    bank: str | None = Field(None, min_length=1, max_length=60)
    name: str | None = Field(None, min_length=1, max_length=120)


class CategoryOut(BaseModel):
    id: int
    name: str
    kind: str  # fixo | variavel | receita | transferencia
    parent_id: int | None = None


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: str | None = None  # obrigatorio sem parent_id; com parent_id e herdado
    parent_id: int | None = None


class TransactionOut(BaseModel):
    id: int
    account_id: int
    date: date
    description: str
    description_norm: str = ""  # base para "criar regra para parecidas" na tela
    amount: float  # negativo = gasto
    category: CategoryOut | None
    category_source: str  # override | regra | pluggy | nenhuma
    excluded: bool = False
    installment: str | None = None  # "3/12"
    bill_month: str | None = None
    recurrence_id: int | None = None


class Page(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int


class MonthlyByCategory(BaseModel):
    month: str  # YYYY-MM
    category: CategoryOut | None
    total: float  # gasto positivo


class Uncategorized(BaseModel):
    count: int
    total: float


class SummaryOut(BaseModel):
    months: list[str]
    by_category: list[MonthlyByCategory]
    total_by_month: dict[str, float]
    income_by_month: dict[str, float]
    uncategorized: Uncategorized  # gastos da janela ainda em "Sem categoria", para o painel cobrar


class RecurrenceOut(BaseModel):
    id: int
    merchant: str  # merchant_norm
    account: AccountOut
    kind: str  # assinatura | parcela | detectada
    periodicity: str  # semanal | mensal | anual
    expected_amount: float
    expected_day: int | None
    next_due: date | None
    ends_at: date | None
    occurrences: int
    confidence: float
    active: bool
    user_decision: str | None  # confirmada | descartada | None
    category: CategoryOut | None


class RecurrenceDecision(BaseModel):
    decision: str = Field(pattern="^(confirmada|descartada)$")


class ForecastLine(BaseModel):
    month: str
    category: CategoryOut | None
    amount: float
    low: float
    high: float
    method: str  # recorrencia | mediana3 | sazonal


class ForecastOut(BaseModel):
    horizon_months: int
    lines: list[ForecastLine]
    total_by_month: dict[str, float]


class ProjectionPoint(BaseModel):
    month: str  # YYYY-MM
    total: float  # gasto positivo
    card: float  # parte em contas type=credit
    bank: float  # parte nas demais contas (corrente, poupanca)
    recurring: float  # parte ligada a recorrencias ativas (qualquer conta)
    projected: bool = False


class ProjectionOut(BaseModel):
    """Historico mensal de um tipo de gasto (ou do total) e extrapolacao pela media dos ultimos
    `months_window` meses completos. Serve o explorador do painel."""

    category: CategoryOut | None  # None = todos os gastos
    months_window: int
    horizon: int
    history: list[ProjectionPoint]  # ordem cronologica, so meses completos
    projection: list[ProjectionPoint]  # projected=True; total/card/bank/recurring = medias da janela
    mean: float
    median: float
    stdev: float
    last_month: float
    trend_pct: float | None  # (ultimo mes - media) / media, None se media = 0


class RuleIn(BaseModel):
    pattern: str
    category_id: int
    priority: int = 100


class RuleOut(RuleIn):
    id: int


class OverrideIn(BaseModel):
    category_id: int | None = None
    exclude: bool = False
    note: str | None = None


class ConnectTokenOut(BaseModel):
    access_token: str  # JWT de curta duracao para abrir o widget Pluggy Connect


class PluggyItemIn(BaseModel):
    item_id: str = Field(min_length=8, max_length=80)
    connector_name: str | None = None


class PluggyItemOut(BaseModel):
    id: int
    connector_name: str | None
    status: str | None  # UPDATED, OUTDATED, LOGIN_ERROR... (ultimo visto no sync)
    source: str  # env | widget
    created_at: datetime | None = None
    accounts: list[
        AccountOut
    ] = []  # contas sincronizadas desta conexao: e assim que o usuario ve qual banco e
    # item_id nunca sai da API: e identificador externo ligado as credenciais do usuario


class HealthOut(BaseModel):
    ok: bool = True
    pluggy: bool  # credenciais + pelo menos um item (env ou widget): sync possivel
    pluggy_credenciais: bool  # client id/secret presentes: widget possivel
    openai: bool


class ImportResult(BaseModel):
    files: int
    accounts_created: int
    transactions_new: int
    transactions_updated: int
    errors: list[str] = []


class SyncResult(BaseModel):
    items: int
    accounts: int
    transactions_new: int
    transactions_updated: int
    errors: list[str] = []


class Tip(BaseModel):
    titulo: str
    categoria: str | None
    economia_estimada_mensal: float | None
    acao: str
    confianca: float = Field(ge=0, le=1)


class InsightsOut(BaseModel):
    resumo: str
    dicas: list[Tip]
    alertas: list[str]
    gerado_em: datetime
    cache: bool = False


class QuestionIn(BaseModel):
    pergunta: str = Field(min_length=3, max_length=2000)


class Action(BaseModel):
    """Acao proposta pelo LLM e aprovada pelo usuario. Validada de verdade em domain.catalogo."""

    tipo: str  # criar_categoria | categorizar
    nome: str | None = None
    kind: str | None = None
    mae: str | None = None
    descricao: str | None = None
    categoria: str | None = None
    motivo: str | None = None
    confianca: float = 1.0


class AnswerOut(BaseModel):
    resposta: str
    acoes: list[Action] = []
    gerado_em: datetime


class CatalogOut(BaseModel):
    sugestoes: list[Action]
    gerado_em: datetime
    cache: bool = False


class ApplyIn(BaseModel):
    acoes: list[Action] = Field(min_length=1, max_length=200)


class ApplyOut(BaseModel):
    categorias_criadas: int
    regras_criadas: int
    ignoradas: list[str]
