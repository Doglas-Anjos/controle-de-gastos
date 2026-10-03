import { expect, test } from "vitest";
import { escapeRegex, regexError } from "./regex";

test("regex valida e invalida", () => {
  expect(regexError("mercado|padaria")).toBeNull();
  expect(regexError("\buber\b")).toBeNull();
  expect(regexError("(mercado")).not.toBeNull();
  expect(regexError("*ifood")).not.toBeNull();
});

test("escapeRegex casa o texto literal inteiro", () => {
  const norm = "pix fulano s a ( ) 1+1";
  expect(new RegExp(`^${escapeRegex(norm)}$`).test(norm)).toBe(true);
  expect(new RegExp(`^${escapeRegex(norm)}$`).test("pix fulano s a x 1+1")).toBe(false);
});
