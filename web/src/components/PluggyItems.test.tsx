import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { PluggyItemOut } from "@/lib/types";
import { PluggyItems } from "./PluggyItems";

afterEach(cleanup);

const items: PluggyItemOut[] = [
  { id: -1, connector_name: "Banco Env", status: "UPDATED", source: "env", created_at: null },
  { id: 3, connector_name: null, status: "LOGIN_ERROR", source: "widget", created_at: "2026-03-05T10:00:00" },
  { id: 4, connector_name: "Banco Beta", status: "OUTDATED", source: "widget", created_at: null },
];

test("lista env e widget, com badges e remover so no widget", () => {
  render(<PluggyItems items={items} onRemove={vi.fn()} />);
  expect(screen.getByText("Configurado no .env")).toBeTruthy();
  expect(screen.getByText("Atualizada")).toBeTruthy();
  expect(screen.getByText("Conexão")).toBeTruthy();
  expect(screen.getByText("Login inválido")).toBeTruthy();
  expect(screen.getByText("Desatualizada")).toBeTruthy();
  expect(screen.getByText(/Reconecte em meu.pluggy.ai/)).toBeTruthy();
  expect(screen.getByText("Conectado em 05/03/2026")).toBeTruthy();
  expect(screen.queryByLabelText("Remover Banco Env")).toBeNull();
  expect(screen.getAllByRole("button")).toHaveLength(2);
});

test("remover pede confirmacao inline", () => {
  const onRemove = vi.fn();
  render(<PluggyItems items={items} onRemove={onRemove} />);
  fireEvent.click(screen.getByLabelText("Remover Banco Beta"));
  expect(onRemove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Remover"));
  expect(onRemove).toHaveBeenCalledWith(4);
});
