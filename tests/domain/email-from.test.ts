import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FROM, normalizeFrom } from "../../src/lib/email/from.ts";

test("acepta un correo simple y uno con nombre", () => {
  assert.strictEqual(normalizeFrom("no-reply@lifeos.com"), "no-reply@lifeos.com");
  assert.strictEqual(normalizeFrom("LifeOS <no-reply@lifeos.com>"), "LifeOS <no-reply@lifeos.com>");
});

test("quita las comillas que Vercel guarda literales (causa del 422 real)", () => {
  assert.strictEqual(normalizeFrom('"LifeOS <no-reply@lifeos.com>"'), "LifeOS <no-reply@lifeos.com>");
  assert.strictEqual(normalizeFrom("'no-reply@lifeos.com'"), "no-reply@lifeos.com");
});

test("recorta espacios y saltos de línea pegados por accidente", () => {
  assert.strictEqual(normalizeFrom("  LifeOS <no-reply@lifeos.com>  \n"), "LifeOS <no-reply@lifeos.com>");
});

test("un valor sin forma de correo cae al default en vez de provocar un 422", () => {
  assert.strictEqual(normalizeFrom("LifeOS"), DEFAULT_FROM);
  assert.strictEqual(normalizeFrom("no-reply@localhost"), DEFAULT_FROM);
  assert.strictEqual(normalizeFrom("<no-reply@lifeos.com"), DEFAULT_FROM);
});

test("vacío, indefinido o solo comillas usan el default", () => {
  assert.strictEqual(normalizeFrom(undefined), DEFAULT_FROM);
  assert.strictEqual(normalizeFrom(""), DEFAULT_FROM);
  assert.strictEqual(normalizeFrom('""'), DEFAULT_FROM);
  assert.strictEqual(normalizeFrom("   "), DEFAULT_FROM);
});
