import { test } from "node:test";
import assert from "node:assert/strict";
import { leerParametrosMercado, rutaDeSerie, seccionesDeMercado, SIN_FUENTE } from "../../src/lib/domain/centro/agente/mercado.ts";
import { money } from "../../src/lib/format.ts";

test("Parámetros: por defecto watchlist en una semana; tickers normalizados y sin repetir", () => {
  assert.deepStrictEqual(leerParametrosMercado({}), { vista: "watchlist", tickers: [], rango: "1S", notas: {} });
  const p = leerParametrosMercado({ vista: "movimientos", tickers: ["nvda", " NVDA ", "no válido!", "avgo"], rango: "1M", notas: { NVDA: "Fuerte." } });
  assert.deepStrictEqual(p, { vista: "movimientos", tickers: ["NVDA", "AVGO"], rango: "1M", notas: { NVDA: "Fuerte." } });
  assert.strictEqual(leerParametrosMercado({ vista: "volar", rango: "5Y" }).vista, "watchlist");
});

test("Las notas con cifras se tiran", () => {
  const p = leerParametrosMercado({ notas: { NVDA: "Subió 4%", AVGO: "Buen momento." } });
  assert.deepStrictEqual(p.notas, { AVGO: "Buen momento." });
});

test("Rutas de serie por rango", () => {
  assert.strictEqual(rutaDeSerie("NVDA", "1D", "2026-09-24"), "/v2/aggs/ticker/NVDA/range/5/minute/2026-09-23/2026-09-24?adjusted=true&sort=asc&limit=5000");
  assert.strictEqual(rutaDeSerie("NVDA", "1S", "2026-09-24"), "/v2/aggs/ticker/NVDA/range/1/hour/2026-09-17/2026-09-24?adjusted=true&sort=asc&limit=5000");
  assert.strictEqual(rutaDeSerie("NVDA", "1M", "2026-09-24"), "/v2/aggs/ticker/NVDA/range/1/day/2026-08-24/2026-09-24?adjusted=true&sort=asc&limit=5000");
  assert.strictEqual(rutaDeSerie("NVDA", "1A", "2026-09-24"), "/v2/aggs/ticker/NVDA/range/1/week/2025-09-23/2026-09-24?adjusted=true&sort=asc&limit=5000");
});

const base = {
  moneda: "MXN",
  locale: "es-MX",
  configurado: true,
  cotizaciones: [
    { ticker: "NVDA", nombre: "NVIDIA", precio: 118.24, pct: 4.32 },
    { ticker: "AVGO", nombre: "Broadcom", precio: 1142.67, pct: 2.18 },
    { ticker: "TSM", nombre: "Taiwan Semi", precio: 214.76, pct: -1.76 }
  ],
  series: { NVDA: [1, 2, 3], AVGO: [3, 2, 4] } as Record<string, number[]>,
  inversiones: [
    { valuation: 10000, currency: "MXN", as_of: "2026-09-12" },
    { valuation: 5000, currency: "MXN", as_of: "2026-09-10" },
    { valuation: 300, currency: "USD", as_of: "2026-09-01" }
  ],
  historia: [{ x: "2026-09-01", y: 14000 }, { x: "2026-09-15", y: 15000 }, { x: "2026-09-20", y: 15200 }]
};

test("Watchlist con cotizaciones y sparkline", () => {
  const [s] = seccionesDeMercado({ ...base, parametros: leerParametrosMercado({ vista: "watchlist" }) });
  assert.strictEqual(s?.kind, "watchlist");
  assert.ok(s?.kind === "watchlist");
  // money(118.24, "USD", "es-MX") en el Node/ICU local usa un espacio de no
  // separación (U+00A0) entre "USD" y la cifra, no un espacio normal: se
  // deriva del formateador de la app (fuente de verdad) en vez de un literal.
  assert.deepStrictEqual(s.data.items[0], { ticker: "NVDA", nombre: "NVIDIA", precio: money(118.24, "USD", "es-MX"), variacion: "+4.32%", tono: "ok", serie: [1, 2, 3] });
  assert.deepStrictEqual(s.data.items[2]?.serie, []);
});

test("Movimientos: los N mayores en valor absoluto, con su nota", () => {
  const [s] = seccionesDeMercado({ ...base, parametros: leerParametrosMercado({ vista: "movimientos", notas: { NVDA: "Sigue fuerte." } }) });
  assert.ok(s?.kind === "movimientos");
  assert.deepStrictEqual(s.data.items.map((i) => i.ticker), ["NVDA", "AVGO", "TSM"]);
  assert.strictEqual(s.data.items[0]?.nota, "Sigue fuerte.");
  assert.strictEqual(s.data.items[2]?.tono, "bad");
});

test("Portafolio: suma en la moneda del perfil y avisa de lo que no suma", () => {
  const [s] = seccionesDeMercado({ ...base, parametros: leerParametrosMercado({ vista: "portafolio" }) });
  assert.ok(s?.kind === "portfolio");
  assert.strictEqual(s.data.total, "$15,000.00");
  assert.match(s.data.nota, /12 sep 2026/);
  assert.match(s.data.nota, /1 inversión en otra moneda no suma/);
  assert.strictEqual(s.data.serie.length, 3);
});

test("Portafolio con menos de tres puntos de historia: sin gráfica", () => {
  const [s] = seccionesDeMercado({ ...base, historia: [{ x: "a", y: 1 }], parametros: leerParametrosMercado({ vista: "portafolio" }) });
  assert.ok(s?.kind === "portfolio");
  assert.deepStrictEqual(s.data.serie, []);
});

test("Sin llave: tickers sí, cifras no, y lo dice", () => {
  const [s] = seccionesDeMercado({
    ...base,
    configurado: false,
    cotizaciones: base.cotizaciones.map((c) => ({ ...c, precio: null, pct: null })),
    series: {},
    parametros: leerParametrosMercado({ vista: "watchlist" })
  });
  assert.ok(s?.kind === "watchlist");
  assert.strictEqual(s.data.configurado, false);
  assert.ok(s.data.items.every((i) => i.precio === null && i.variacion === null));
});

test("Gráfica de un ticker: un solo ticker con su serie; sin serie, mensaje", () => {
  const conSerie = seccionesDeMercado({ ...base, parametros: leerParametrosMercado({ vista: "grafica", tickers: ["NVDA"] }) });
  assert.strictEqual(conSerie[0]?.kind, "chart");
  const sin = seccionesDeMercado({ ...base, series: {}, parametros: leerParametrosMercado({ vista: "grafica", tickers: ["NVDA"] }) });
  assert.deepStrictEqual(sin[0], { id: "mercado-grafica", kind: "emptyState", title: "NVDA", data: { mensaje: SIN_FUENTE } });
});

test("Sin tickers en la watchlist: dice qué hacer", () => {
  const [s] = seccionesDeMercado({ ...base, cotizaciones: [], parametros: leerParametrosMercado({ vista: "watchlist" }) });
  assert.strictEqual(s?.kind, "emptyState");
});
