import { expect, test } from "vitest";
import { confidenceLevel, installmentProgress, monthlyCommitted } from "./recurrence";
import type { RecurrenceOut } from "./types";

const base: RecurrenceOut = {
  id: 1, merchant: "Streaming Alfa",
  account: { id: 1, bank: "Nubank", name: "Cartão", type: "credit", source: "ofx", last_sync_at: null },
  kind: "assinatura", periodicity: "mensal", expected_amount: 40, expected_day: 5,
  next_due: "2026-04-05", ends_at: null, occurrences: 4, confidence: 0.9,
  active: true, user_decision: null, category: null,
};

test("comprometido soma equivalente mensal e ignora pendentes e descartadas", () => {
  const recs: RecurrenceOut[] = [
    base,
    { ...base, id: 2, periodicity: "anual", expected_amount: 120 },
    { ...base, id: 3, kind: "detectada" },
    { ...base, id: 4, kind: "detectada", user_decision: "confirmada", expected_amount: 10 },
    { ...base, id: 5, user_decision: "descartada" },
  ];
  expect(monthlyCommitted(recs)).toBeCloseTo(40 + 10 + 10);
});

test("progresso de parcelas a partir de ocorrencias e data final", () => {
  const p = installmentProgress({ ...base, kind: "parcela", occurrences: 6, next_due: "2026-04-10", ends_at: "2026-09-10" });
  expect(p).toEqual({ paid: 6, total: 12 });
  expect(installmentProgress(base)).toBeNull();
});

test("nivel de confianca", () => {
  expect(confidenceLevel(0.87)).toBe("alta");
  expect(confidenceLevel(0.7)).toBe("média");
  expect(confidenceLevel(0.35)).toBe("baixa");
});
