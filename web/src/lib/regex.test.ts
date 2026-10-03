import { expect, test } from "vitest";
import { regexError } from "./regex";

test("regex valida e invalida", () => {
  expect(regexError("mercado|padaria")).toBeNull();
  expect(regexError("\buber\b")).toBeNull();
  expect(regexError("(mercado")).not.toBeNull();
  expect(regexError("*ifood")).not.toBeNull();
});
