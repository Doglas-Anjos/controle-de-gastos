import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RecurrenceOut } from "@/lib/types";
import { RecurrenceCard } from "./RecurrenceCard";

afterEach(cleanup);

const rec: RecurrenceOut = {
  id: 7, merchant: "Streaming Alfa",
  account: { id: 1, bank: "Nubank", name: "Cartão", type: "credit", source: "ofx", last_sync_at: null },
  kind: "detectada", periodicity: "mensal", expected_amount: 39.9, expected_day: 5,
  next_due: "2026-04-05", ends_at: null, occurrences: 4, confidence: 0.87,
  active: true, user_decision: null, category: null,
};

test("botoes chamam o callback com a decisao", () => {
  const onDecide = vi.fn();
  render(<RecurrenceCard rec={rec} onDecide={onDecide} />);
  fireEvent.click(screen.getByText("Confirmar"));
  fireEvent.click(screen.getByText("Descartar"));
  expect(onDecide).toHaveBeenNthCalledWith(1, 7, "confirmada");
  expect(onDecide).toHaveBeenNthCalledWith(2, 7, "descartada");
});

test("sem botoes quando ja decidida", () => {
  render(<RecurrenceCard rec={{ ...rec, user_decision: "confirmada" }} onDecide={vi.fn()} />);
  expect(screen.queryByText("Confirmar")).toBeNull();
  expect(screen.getByText("87%")).toBeTruthy();
});
