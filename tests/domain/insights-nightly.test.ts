import { test } from "node:test";
import assert from "node:assert/strict";
import { debeAnalizar } from "../../src/lib/domain/insights/nightly.ts";

test("debeAnalizar: sin hechos no se llama al modelo", () => {
  assert.equal(debeAnalizar(0, "h", null), "sin-hechos");
});

test("debeAnalizar: los mismos hechos que la última vez no se vuelven a analizar", () => {
  assert.equal(debeAnalizar(4, "abc", "abc"), "sin-cambios");
});

test("debeAnalizar: hechos nuevos o primera noche, se analiza", () => {
  assert.equal(debeAnalizar(4, "abc", "xyz"), "analizar");
  assert.equal(debeAnalizar(4, "abc", null), "analizar");
});
