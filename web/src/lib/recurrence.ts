import type { RecurrenceOut } from "./types";

// Valor mensal equivalente de cada periodicidade.
const POR_MES: Record<string, number> = { semanal: 52 / 12, mensal: 1, anual: 1 / 12 };

export const isPending = (r: RecurrenceOut) => r.kind === "detectada" && r.user_decision === null;

// Compromete o orcamento: assinaturas, parcelas e detectadas confirmadas. Descartadas e pendentes ficam fora.
export function monthlyCommitted(recs: RecurrenceOut[]) {
  return recs
    .filter((r) => r.active && r.user_decision !== "descartada" && (r.kind !== "detectada" || r.user_decision === "confirmada"))
    .reduce((s, r) => s + Math.abs(r.expected_amount) * (POR_MES[r.periodicity] ?? 1), 0);
}

// Parcelas: a API da ocorrencias pagas e a data final; o total sai de quantos vencimentos mensais faltam.
export function installmentProgress(r: RecurrenceOut): { paid: number; total: number } | null {
  if (r.kind !== "parcela" || !r.ends_at) return null;
  let restantes = 0;
  if (r.next_due && r.next_due <= r.ends_at) {
    const [y1, m1] = r.next_due.split("-").map(Number);
    const [y2, m2] = r.ends_at.split("-").map(Number);
    restantes = (y2 - y1) * 12 + (m2 - m1) + 1;
  }
  return { paid: r.occurrences, total: r.occurrences + restantes };
}

export function confidenceLevel(c: number): "alta" | "média" | "baixa" {
  return c >= 0.8 ? "alta" : c >= 0.6 ? "média" : "baixa";
}
