import { test } from "node:test";
import assert from "node:assert/strict";
import { idDeFila, limiteConsulta, ventanaConsulta, MAX_DIAS_CONSULTA } from "../../src/lib/domain/ai/tools.ts";
import { MAX_FILAS_CONSULTA } from "../../src/lib/insights/context.ts";

// Lo que el modelo pide NO es de fiar: son argumentos generados, no validados.
// Estas reglas son las que impiden que una consulta suya se traiga una vida
// entera o una ventana sin sentido.

test("ventanaConsulta: una ventana normal se acepta y el final es EXCLUSIVO, para que el último día entre entero", () => {
  const v = ventanaConsulta("2026-09-01", "2026-09-03", "2026-09-03");
  assert.deepStrictEqual(v, { ok: true, desde: "2026-09-01", hastaExclusivo: "2026-09-04" });
});

test("ventanaConsulta: el fin de mes avanza de mes, no al día 32", () => {
  const v = ventanaConsulta("2026-08-01", "2026-08-31", "2026-09-03");
  assert.strictEqual(v.ok && v.hastaExclusivo, "2026-09-01");
});

test("ventanaConsulta: una fecha que no es una fecha se rechaza", () => {
  assert.strictEqual(ventanaConsulta("ayer", "2026-09-03", "2026-09-03").ok, false);
  assert.strictEqual(ventanaConsulta("2026-13-45", "2026-09-03", "2026-09-03").ok, false);
});

test("ventanaConsulta: el orden invertido se rechaza en vez de devolver vacío en silencio", () => {
  assert.strictEqual(ventanaConsulta("2026-09-03", "2026-09-01", "2026-09-03").ok, false);
});

test("ventanaConsulta: no se consulta el futuro — el final se recorta a hoy", () => {
  const v = ventanaConsulta("2026-09-01", "2027-01-01", "2026-09-03");
  assert.strictEqual(v.ok && v.hastaExclusivo, "2026-09-04");
});

test("ventanaConsulta: una ventana enorme se recorta por el principio, no se rechaza", () => {
  const v = ventanaConsulta("2000-01-01", "2026-09-03", "2026-09-03");
  assert.ok(v.ok);
  const dias = (Date.parse(v.hastaExclusivo) - Date.parse(v.desde)) / 86400000;
  assert.strictEqual(dias, MAX_DIAS_CONSULTA);
});

test("limiteConsulta: lo que pida el modelo se acota al tope, y un disparate cae en el tope", () => {
  assert.strictEqual(limiteConsulta(10), 10);
  assert.strictEqual(limiteConsulta(5000), MAX_FILAS_CONSULTA);
  assert.strictEqual(limiteConsulta(0), MAX_FILAS_CONSULTA);
  assert.strictEqual(limiteConsulta(undefined), MAX_FILAS_CONSULTA);
  assert.strictEqual(limiteConsulta(-3), MAX_FILAS_CONSULTA);
});

test("idDeFila: el id que se le enseña al modelo dice de qué tabla salió, para poder auditar la cita", () => {
  assert.strictEqual(idDeFila("habit_logs", "abc"), "fila:habit_logs:abc");
});
