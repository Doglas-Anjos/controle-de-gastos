import { expect, test } from "vitest";
import { formatBRL, formatDate, formatMonth } from "./format";

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
