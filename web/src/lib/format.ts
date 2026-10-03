const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  return `${MESES[Number(mo) - 1] ?? mo}/${y}`;
}

// Fatia a string em vez de usar Date para nao deslocar o dia por fuso horario.
export function formatDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

export const currentMonth = () => new Date().toISOString().slice(0, 7);
