import type { RecurrenceKind, RecurrenceOut } from "./types";

// Valor mensal equivalente de cada periodicidade.
const POR_MES: Record<string, number> = { semanal: 52 / 12, mensal: 1, anual: 1 / 12 };

export const isPending = (r: RecurrenceOut) => r.kind === "detectada" && r.user_decision === null;

const compromete = (r: RecurrenceOut) =>
  r.active && r.user_decision !== "descartada" && (r.kind !== "detectada" || r.user_decision === "confirmada");
const mensal = (r: RecurrenceOut) => Math.abs(r.expected_amount) * (POR_MES[r.periodicity] ?? 1);

// Compromete o orcamento: assinaturas, parcelas e detectadas confirmadas. Descartadas e pendentes ficam fora.
export function monthlyCommitted(recs: RecurrenceOut[]) {
  return recs.filter(compromete).reduce((s, r) => s + mensal(r), 0);
}

export const isCard = (r: RecurrenceOut) => r.account.type === "credit";
export type PayFilter = "todas" | "cartao" | "conta";
export const byPay = (recs: RecurrenceOut[], f: PayFilter) =>
  f === "todas" ? recs : recs.filter((r) => isCard(r) === (f === "cartao"));

export interface Split { total: number; count: number; porKind: Record<RecurrenceKind, number> }

// Separa o compromisso mensal entre cartao de credito e demais contas (Pix, debito, boleto).
export function splitRecorrencias(recs: RecurrenceOut[]): { card: Split; bank: Split } {
  const novo = (): Split => ({ total: 0, count: 0, porKind: { assinatura: 0, parcela: 0, detectada: 0 } });
  const out = { card: novo(), bank: novo() };
  for (const r of recs.filter(compromete)) {
    const s = isCard(r) ? out.card : out.bank;
    s.total += mensal(r);
    s.count += 1;
    s.porKind[r.kind] += 1;
  }
  return out;
}

const PLURAL: Record<RecurrenceKind, [string, string]> = {
  assinatura: ["assinatura", "assinaturas"], parcela: ["parcela", "parcelas"], detectada: ["detectada", "detectadas"],
};
export function splitHint(s: Split) {
  const partes = (Object.keys(PLURAL) as RecurrenceKind[]).filter((k) => s.porKind[k] > 0)
    .map((k) => `${s.porKind[k]} ${PLURAL[k][s.porKind[k] === 1 ? 0 : 1]}`);
  return partes.length ? partes.join(", ") : "Nenhuma recorrência";
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
