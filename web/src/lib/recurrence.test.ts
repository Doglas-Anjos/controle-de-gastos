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

test("split separa cartao de conta e descreve as contagens", async () => {
  const { splitRecorrencias, splitHint, byPay } = await import("./recurrence");
  const conta = { ...base.account, id: 2, type: "checking" as const, name: "Conta" };
  const recs: RecurrenceOut[] = [
    base,
    { ...base, id: 2, kind: "parcela", expected_amount: 100 },
    { ...base, id: 3, kind: "detectada", user_decision: "confirmada", expected_amount: 1800, account: conta },
    { ...base, id: 4, kind: "detectada", account: conta }, // pendente: nao compromete
    { ...base, id: 5, user_decision: "descartada", account: conta },
  ];
  const s = splitRecorrencias(recs);
  expect(s.card.total).toBeCloseTo(140);
  expect(s.card.count).toBe(2);
  expect(s.bank.total).toBeCloseTo(1800);
  expect(splitHint(s.card)).toBe("1 assinatura, 1 parcela");
  expect(splitHint(s.bank)).toBe("1 detectada");
  expect(splitHint({ total: 0, count: 0, porKind: { assinatura: 0, parcela: 0, detectada: 0 } })).toBe("Nenhuma recorrência");
  expect(byPay(recs, "conta").map((r) => r.id)).toEqual([3, 4, 5]);
  expect(byPay(recs, "cartao")).toHaveLength(2);
  expect(byPay(recs, "todas")).toHaveLength(5);
});
