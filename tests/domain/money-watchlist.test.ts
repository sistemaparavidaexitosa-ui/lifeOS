import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_WATCHLIST, normalizarTicker, variacion } from "../../src/lib/domain/money/watchlist.ts";

// La watchlist (D-184). Lo que se puede decidir sin llave ni red.

test("normaliza a mayúsculas y acepta las formas reales del mercado", () => {
  assert.equal(normalizarTicker("aapl"), "AAPL");
  assert.equal(normalizarTicker("  nvda  "), "NVDA");
  assert.equal(normalizarTicker("BRK.B"), "BRK.B");
  assert.equal(normalizarTicker("RDS-A"), "RDS-A");
});

test("rechaza lo que no es un ticker", () => {
  assert.equal(normalizarTicker(""), null);
  assert.equal(normalizarTicker("1AAPL"), null, "no empieza por letra");
  assert.equal(normalizarTicker("AA PL"), null, "sin espacios");
  assert.equal(normalizarTicker("A".repeat(13)), null, "demasiado largo");
  assert.equal(normalizarTicker("DROP TABLE"), null);
});

// El patrón es el espejo del `check` de la migración 0073.
test("lo que pasa aquí pasaría el check de la base", () => {
  const patronDeLaBase = /^[A-Z][A-Z0-9.-]{0,11}$/;
  for (const t of ["aapl", "BRK.B", "rds-a", "tsm"]) {
    const n = normalizarTicker(t)!;
    assert.match(n, patronDeLaBase, `${n} no pasaría el check`);
  }
});

test("la variación lleva signo, tono y texto listo para pintar", () => {
  assert.deepEqual(variacion(1.239), { pct: 1.24, tono: "ok", texto: "+1.24%" });
  assert.deepEqual(variacion(-3.5), { pct: -3.5, tono: "bad", texto: "-3.50%" });
});

// Un 0.03% en verde es ruido con aspecto de señal: el ojo lee color antes que
// número, y en una lista de diez tickers son diez señales falsas.
test("lo casi plano NO se pinta de color", () => {
  assert.equal(variacion(0.04)?.tono, "info");
  assert.equal(variacion(-0.09)?.tono, "info");
  assert.equal(variacion(0.11)?.tono, "ok");
});

test("sin dato no se inventa una variación", () => {
  assert.equal(variacion(null), null);
  assert.equal(variacion(undefined), null);
  assert.equal(variacion(Number.NaN), null);
});

test("hay un tope, porque una watchlist de cincuenta no es una watchlist", () => {
  assert.ok(MAX_WATCHLIST > 0 && MAX_WATCHLIST <= 30);
});
