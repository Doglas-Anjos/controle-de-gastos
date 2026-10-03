import { expect, test } from "vitest";
import type { SummaryOut } from "@/lib/types";
import { categorySeries } from "./Charts";

const cat = (id: number) => ({ id, name: `C${id}`, kind: "variavel", parent_id: null });

test("mais de 8 categorias agrupa as menores em Outras e a cor segue o id", () => {
  const summary: SummaryOut = {
    months: ["2026-03"], total_by_month: {}, income_by_month: {}, uncategorized: { count: 0, total: 0 },
    by_category: Array.from({ length: 10 }, (_, i) => ({ month: "2026-03", category: cat(i + 1), total: 100 - i })),
  };
  const s = categorySeries(summary);
  expect(s).toHaveLength(8);
  expect(s[0]).toMatchObject({ key: "c1", color: "var(--series-1)" });
  expect(s[7]).toMatchObject({ key: "outras", total: 93 + 92 + 91 });
});

test("cores nao se repetem no grafico mesmo com ids que colidem", () => {
  const summary: SummaryOut = {
    months: ["2026-03"], total_by_month: {}, income_by_month: {}, uncategorized: { count: 0, total: 0 },
    by_category: [1, 9, 2].map((id, i) => ({ month: "2026-03", category: cat(id), total: 100 - i })),
  };
  const cores = categorySeries(summary).map((s) => s.color);
  expect(cores[0]).toBe("var(--series-1)");
  expect(new Set(cores).size).toBe(3);
});
