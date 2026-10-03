// Contrato da API (api/src/gastos/api/schemas.py). Mantem snake_case como no JSON.
export interface Health { ok: boolean; pluggy: boolean; pluggy_credenciais: boolean; openai: boolean }
export interface PluggyItemOut { id: number; connector_name: string | null; status: string | null; source: "env" | "widget"; created_at: string | null; accounts: AccountOut[] }
export interface AccountOut { id: number; bank: string; name: string; type: string; source: string; last_sync_at: string | null; hint?: string | null }
export interface CategoryOut { id: number; name: string; kind: string; parent_id: number | null }
export interface CategoryIn { name: string; kind?: string; parent_id?: number | null }
export interface TransactionOut {
  id: number; account_id: number; date: string; description: string; description_norm: string; amount: number
  category: CategoryOut | null
  category_source: "override" | "regra" | "pluggy" | "nenhuma" | string
  excluded: boolean; installment: string | null; bill_month: string | null; recurrence_id: number | null
}
export interface Page { items: TransactionOut[]; total: number; page: number; page_size: number }
export interface MonthlyByCategory { month: string; category: CategoryOut | null; total: number }
export interface SummaryOut {
  months: string[]; by_category: MonthlyByCategory[]
  total_by_month: Record<string, number>; income_by_month: Record<string, number>
  uncategorized: { count: number; total: number }
}
export type RecurrenceKind = "assinatura" | "parcela" | "detectada"
export interface RecurrenceOut {
  id: number; merchant: string; account: AccountOut; kind: RecurrenceKind
  periodicity: "semanal" | "mensal" | "anual" | string
  expected_amount: number; expected_day: number | null
  next_due: string | null; ends_at: string | null; occurrences: number; confidence: number
  active: boolean; user_decision: "confirmada" | "descartada" | null; category: CategoryOut | null
}
export interface RecurrenceDecision { decision: "confirmada" | "descartada" }
export interface ForecastLine {
  month: string; category: CategoryOut | null; amount: number; low: number; high: number
  method: "recorrencia" | "mediana3" | "sazonal" | string
}
export interface ForecastOut { horizon_months: number; lines: ForecastLine[]; total_by_month: Record<string, number> }
export interface RuleIn { pattern: string; category_id: number; priority: number }
export interface RuleOut extends RuleIn { id: number }
export interface OverrideIn { category_id?: number | null; exclude?: boolean; note?: string | null }
export interface ImportResult { files: number; accounts_created: number; transactions_new: number; transactions_updated: number; errors: string[] }
export interface SyncResult { items: number; accounts: number; transactions_new: number; transactions_updated: number; errors: string[] }
export interface Tip { titulo: string; categoria: string | null; economia_estimada_mensal: number | null; acao: string; confianca: number }
export interface InsightsOut { resumo: string; dicas: Tip[]; alertas: string[]; gerado_em: string; cache: boolean }
export interface Action {
  tipo: "criar_categoria" | "categorizar" | string
  nome?: string | null; kind?: string | null; mae?: string | null
  descricao?: string | null; categoria?: string | null; motivo?: string | null; confianca: number
}
export interface AnswerOut { resposta: string; acoes: Action[]; gerado_em: string }
export interface CatalogOut { sugestoes: Action[]; gerado_em: string; cache: boolean }
export interface ApplyOut { categorias_criadas: number; regras_criadas: number; ignoradas: string[] }
export interface ProjectionPoint { month: string; total: number; card: number; bank: number; recurring: number; projected: boolean }
export interface ProjectionOut {
  category: CategoryOut | null; months_window: number; horizon: number
  history: ProjectionPoint[]; projection: ProjectionPoint[]
  mean: number; median: number; stdev: number; last_month: number; trend_pct: number | null
}
