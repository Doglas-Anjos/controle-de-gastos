import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DateRangePicker } from "./DateRangePicker";

afterEach(cleanup);

test("periodo: dois cliques definem inicio e fim, em qualquer ordem", () => {
  const onChange = vi.fn();
  render(<DateRangePicker value={{ de: "2026-09-01", ate: "2026-09-30" }} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Período" }));
  expect(screen.getByText("setembro de 2026")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "20/09/2026" }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "10/09/2026" }));
  expect(onChange).toHaveBeenCalledWith({ de: "2026-09-10", ate: "2026-09-20" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("dia: um clique escolhe; atalhos nao aparecem", () => {
  const onChange = vi.fn();
  render(<DateRangePicker single value={{ de: "2026-09-15", ate: "2026-09-15" }} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Dia" }));
  expect(screen.queryByText("Mês passado")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "03/09/2026" }));
  expect(onChange).toHaveBeenCalledWith({ de: "2026-09-03", ate: "2026-09-03" });
});
