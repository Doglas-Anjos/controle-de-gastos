import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CategoryPicker } from "./CategoryPicker";

afterEach(cleanup);

const cats = [
  { id: 1, name: "Mercado", kind: "variavel", parent_id: null },
  { id: 2, name: "Moradia", kind: "fixo", parent_id: null },
  { id: 3, name: "Sem categoria", kind: "variavel", parent_id: null },
  { id: 4, name: "Bolsa", kind: "receita", parent_id: null },
];

test("agrupa por tipo, poe Sem categoria primeiro e escolhe ao clicar", () => {
  const onChange = vi.fn();
  render(<CategoryPicker categories={cats} value={1} onChange={onChange} allLabel="Todas as categorias" ariaLabel="Categoria" />);
  fireEvent.click(screen.getByRole("button", { name: "Categoria" }));
  const grupos = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label")).filter(Boolean);
  expect(grupos).toEqual(["Pendente", "Gastos fixos", "Gastos variáveis", "Entradas"]);
  expect(screen.getByRole("option", { name: /Mercado/ }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("option", { name: /Bolsa/ }));
  expect(onChange).toHaveBeenCalledWith(4);
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("teclado: setas abrem e Enter escolhe; Escape fecha", () => {
  const onChange = vi.fn();
  render(<CategoryPicker categories={cats} value="" onChange={onChange} allLabel="Todas" ariaLabel="Categoria" />);
  const botao = screen.getByRole("button", { name: "Categoria" });
  fireEvent.keyDown(botao, { key: "ArrowDown" });
  fireEvent.keyDown(botao, { key: "ArrowDown" }); // de "Todas" para "Sem categoria"
  fireEvent.keyDown(botao, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith(3);
  fireEvent.keyDown(botao, { key: "ArrowDown" });
  expect(screen.getByRole("listbox")).toBeTruthy();
  fireEvent.keyDown(botao, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
});
