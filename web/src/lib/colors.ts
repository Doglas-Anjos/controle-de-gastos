import type { CategoryOut } from "./types";

// Cor segue a categoria (id), nunca a posicao no grafico: filtrar ou paginar nao repinta nada.
// Sao 8 tons validados (skill dataviz); o grafico agrupa o excedente em "Outras".
export function categoryColor(c: Pick<CategoryOut, "id"> | null | undefined) {
  if (!c) return "var(--series-other)";
  return `var(--series-${((c.id - 1) % 8 + 8) % 8 + 1})`;
}

// Cartao e conta tem cor fixa em todas as telas, distinta das categorias.
export const PAY_COLOR = { card: "var(--pay-card)", bank: "var(--pay-bank)" } as const;
export const PAY_LABEL = { card: "Cartão", bank: "Conta" } as const;
