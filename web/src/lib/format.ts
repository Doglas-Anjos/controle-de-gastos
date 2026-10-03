const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Eixos de grafico: "R$ 1,2 mil" cabe melhor que "R$ 1.234,00".
export const formatBRLCompact = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

export function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  return `${MESES[Number(mo) - 1] ?? mo}/${y}`;
}

export function formatMonthLong(m: string) {
  const [y, mo] = m.split("-");
  return `${MESES_LONGOS[Number(mo) - 1] ?? mo} de ${y}`;
}

// Fatia a string em vez de usar Date para nao deslocar o dia por fuso horario.
export function formatDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

export function formatDayMonth(d: string) {
  const [, m, day] = d.slice(0, 10).split("-");
  return `${Number(day)} ${MESES[Number(m) - 1]}`;
}

// Data local (nao UTC): perto da meia-noite o toISOString() viraria o dia errado no Brasil.
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const currentMonth = () => today().slice(0, 7);

export function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const t = y * 12 + (mo - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

const diaUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

export function daysBetween(from: string, to: string) {
  return Math.round((diaUTC(to) - diaUTC(from)) / 86_400_000);
}

export function formatRelativeDay(d: string, ref: string = today()) {
  const n = daysBetween(ref, d);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}

export const formatPercent = (v: number, digits = 1) =>
  `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

// Nomes de categoria vem sem acento do banco; aqui so a exibicao ganha acento.
const ACENTOS: Record<string, string> = {
  "Alimentacao": "Alimentação", "Saude": "Saúde", "Educacao": "Educação",
  "Transferencia": "Transferência", "Contas e servicos": "Contas e serviços",
  "Salario": "Salário", "Renda variavel": "Renda variável", "Emprestimos": "Empréstimos",
};
export const catLabel = (name: string | null | undefined) => (name ? ACENTOS[name] ?? name : "Sem categoria");

// Comerciantes chegam normalizados em minusculas ("loja de moveis exemplo"); so a exibicao vira titulo.
// Conectores ficam minusculos fora da primeira palavra. Nunca use o resultado em chamadas para a API.
const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
export const merchantLabel = (m: string) =>
  m.toLowerCase().replace(/[^\s]+/g, (w, i: number) =>
    i > 0 && CONECTORES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1));

export const PERIODICIDADE: Record<string, string> = { semanal: "Semanal", mensal: "Mensal", anual: "Anual" };
