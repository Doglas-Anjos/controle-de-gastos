import { expect, test } from "vitest";
import { catLabel, merchantLabel, formatBRL, formatDate, formatMonth, formatPercent, formatRelativeDay, shiftMonth } from "./format";

test("formatMonth", () => {
  expect(formatMonth("2026-03")).toBe("mar/2026");
  expect(formatMonth("2026-12")).toBe("dez/2026");
});

test("formatDate nao desloca o dia", () => {
  expect(formatDate("2026-03-01")).toBe("01/03/2026");
  expect(formatDate("2026-03-31T23:30:00")).toBe("31/03/2026");
});

test("formatBRL", () => {
  expect(formatBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
  expect(formatBRL(-10).replace(/\s/g, " ")).toBe("-R$ 10,00");
});

test("shiftMonth atravessa o ano", () => {
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftMonth("2026-05", 0)).toBe("2026-05");
});

test("formatRelativeDay", () => {
  expect(formatRelativeDay("2026-04-05", "2026-04-05")).toBe("hoje");
  expect(formatRelativeDay("2026-04-06", "2026-04-05")).toBe("amanhã");
  expect(formatRelativeDay("2026-04-08", "2026-04-05")).toBe("em 3 dias");
  expect(formatRelativeDay("2026-03-30", "2026-04-01")).toBe("há 2 dias");
});

test("catLabel acentua so a exibicao", () => {
  expect(catLabel("Alimentacao")).toBe("Alimentação");
  expect(catLabel("Mercado")).toBe("Mercado");
  expect(catLabel(null)).toBe("Sem categoria");
});

test("formatPercent com sinal", () => {
  expect(formatPercent(12.34)).toBe("+12,3%");
  expect(formatPercent(-5)).toBe("-5,0%");
});

test("merchantLabel capitaliza so a exibicao", () => {
  expect(merchantLabel("aluguel imovel exemplo")).toBe("Aluguel Imovel Exemplo");
  expect(merchantLabel("streaming alfa")).toBe("Streaming Alfa");
  expect(merchantLabel("loja de moveis e cia")).toBe("Loja de Moveis e Cia");
  expect(merchantLabel("de casa  mercado")).toBe("De Casa  Mercado");
});
