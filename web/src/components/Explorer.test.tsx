import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { ProjectionOut } from "@/lib/types";
import { ProjectionStats } from "./Explorer";

afterEach(cleanup);

const ponto = (month: string, total: number, projected = false) => ({ month, total, card: total / 2, bank: total / 2, recurring: 0, projected });
const base: ProjectionOut = {
  category: null, months_window: 6, horizon: 3,
  history: [ponto("2026-04", 1000), ponto("2026-05", 1100), ponto("2026-06", 900), ponto("2026-07", 1000), ponto("2026-08", 1000), ponto("2026-09", 1200)],
  projection: [ponto("2026-11", 1033.33, true), ponto("2026-12", 1033.33, true), ponto("2027-01", 1033.33, true)],
  mean: 1033.33, median: 1000, stdev: 103.28, last_month: 1200, trend_pct: 0.1613,
};

test("tiles mostram media, ultimo mes com alta e projecao", () => {
  render(<ProjectionStats p={base} />);
  expect(screen.getByText("Média de 6 meses")).toBeTruthy();
  expect(screen.getByText(/\+16,1%\s*vs média/)).toBeTruthy();
  expect(screen.getByText("Projeção próximo mês").nextSibling?.textContent).toContain("1.033,33");
  expect(screen.getByText("Variação típica")).toBeTruthy();
});

test("ultimo mes abaixo da media aparece como queda", () => {
  render(<ProjectionStats p={{ ...base, last_month: 800, trend_pct: -0.2258 }} />);
  expect(screen.getByText(/-22,6%\s*vs média/)).toBeTruthy();
});

test("sem base quando a media e zero", () => {
  render(<ProjectionStats p={{ ...base, mean: 0, last_month: 0, trend_pct: null }} />);
  expect(screen.getByText("sem base")).toBeTruthy();
});
