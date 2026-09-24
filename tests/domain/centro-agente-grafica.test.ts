// tests/domain/centro-agente-grafica.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { trazo } from "../../src/lib/domain/centro/agente/grafica.ts";

test("Un trazo recorre de izquierda a derecha y ocupa el alto", () => {
  assert.strictEqual(trazo([0, 10], 100, 20), "M0,20 L100,0");
});
test("Una serie plana va por el medio", () => {
  assert.strictEqual(trazo([5, 5, 5], 100, 20), "M0,10 L50,10 L100,10");
});
test("Menos de dos puntos: sin trazo", () => {
  assert.strictEqual(trazo([1], 100, 20), "");
});
