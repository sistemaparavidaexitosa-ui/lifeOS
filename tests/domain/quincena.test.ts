import { test } from "node:test";
import assert from "node:assert/strict";
import { quincenaFor, quincenaFromKey, shiftQuincena, monthRangeOf } from "../../src/lib/domain/quincena.ts";

test("quincenaFor: el día 15 todavía es Quincena 1", () => {
  const q = quincenaFor("2026-08-15");
  assert.strictEqual(q.half, 1);
  assert.strictEqual(q.key, "2026-08-Q1");
  assert.strictEqual(q.fromISO, "2026-08-01");
  assert.strictEqual(q.toISO, "2026-08-15");
});

test("quincenaFor: el día 16 ya es Quincena 2 y termina el último día del mes", () => {
  const q = quincenaFor("2026-08-16");
  assert.strictEqual(q.half, 2);
  assert.strictEqual(q.key, "2026-08-Q2");
  assert.strictEqual(q.fromISO, "2026-08-16");
  assert.strictEqual(q.toISO, "2026-08-31");
});

test("quincenaFor: Q2 de un mes de 30 días termina el 30", () => {
  assert.strictEqual(quincenaFor("2026-09-20").toISO, "2026-09-30");
});

test("quincenaFor: Q2 de febrero no bisiesto termina el 28", () => {
  assert.strictEqual(quincenaFor("2026-02-17").toISO, "2026-02-28");
});

test("quincenaFor: Q2 de febrero bisiesto termina el 29", () => {
  assert.strictEqual(quincenaFor("2028-02-17").toISO, "2028-02-29");
});

test("shiftQuincena: de Q2 a Q1 dentro del mismo mes y de vuelta", () => {
  const q2 = quincenaFor("2026-08-20");
  const prev = shiftQuincena(q2, -1);
  assert.strictEqual(prev.key, "2026-08-Q1");
  assert.strictEqual(shiftQuincena(prev, 1).key, "2026-08-Q2");
});

test("shiftQuincena: retroceder desde Q1 cae en Q2 del mes anterior", () => {
  const prev = shiftQuincena(quincenaFor("2026-03-04"), -1);
  assert.strictEqual(prev.key, "2026-02-Q2");
  assert.strictEqual(prev.toISO, "2026-02-28");
});

test("shiftQuincena: avanzar desde Q2 de diciembre cruza el año", () => {
  const next = shiftQuincena(quincenaFor("2026-12-20"), 1);
  assert.strictEqual(next.key, "2027-01-Q1");
  assert.strictEqual(next.fromISO, "2027-01-01");
});

test("shiftQuincena: retroceder desde Q1 de enero cruza el año hacia atrás", () => {
  const prev = shiftQuincena(quincenaFor("2027-01-10"), -1);
  assert.strictEqual(prev.key, "2026-12-Q2");
  assert.strictEqual(prev.toISO, "2026-12-31");
});

test("quincenaFromKey: reconstruye exactamente la quincena que produjo la clave", () => {
  const original = quincenaFor("2026-08-20");
  const restored = quincenaFromKey(original.key);
  assert.deepStrictEqual(restored, original);
});

test("quincenaFromKey: devuelve null con una clave inválida en vez de lanzar", () => {
  assert.strictEqual(quincenaFromKey("no-es-una-clave"), null);
  assert.strictEqual(quincenaFromKey("2026-13-Q1"), null);
  assert.strictEqual(quincenaFromKey("2026-08-Q3"), null);
});

test("monthRangeOf: ambas quincenas de un mes devuelven el mes natural completo", () => {
  const q1 = quincenaFor("2026-08-03");
  const q2 = quincenaFor("2026-08-25");
  assert.deepStrictEqual(monthRangeOf(q1), { fromISO: "2026-08-01", toISO: "2026-08-31" });
  assert.deepStrictEqual(monthRangeOf(q2), { fromISO: "2026-08-01", toISO: "2026-08-31" });
});

test("label: describe el rango en lenguaje corto y legible", () => {
  assert.strictEqual(quincenaFor("2026-08-20").label, "Quincena 2 · 16–31 ago");
  assert.strictEqual(quincenaFor("2026-01-02").label, "Quincena 1 · 1–15 ene");
});
