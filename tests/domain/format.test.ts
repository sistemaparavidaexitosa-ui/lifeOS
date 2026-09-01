// tests/domain/format.test.ts
//
// EL DÍA DE MENOS. `fdate` recibía un `2026-08-31` de una columna `date`,
// `new Date()` lo leía como medianoche UTC e Intl lo formateaba en la zona del
// proceso: en México (UTC-6) eso son las 18:00 del día anterior, así que la
// pantalla decía "30 ago 2026". Se destapó con las semanas del plan de
// lectura —una semana anclada al lunes se anunciaba empezando en domingo—
// pero afectaba a cada fecha pura de la app: vencimientos, horizontes de
// metas, cortes de reporte y la fecha estimada de término de un libro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fdate } from "../../src/lib/format.ts";

test("fdate no corre una fecha de calendario al día anterior", () => {
  // El 31 de agosto es el 31 de agosto en Tijuana y en Madrid: una fecha sin
  // hora no tiene zona horaria que aplicarle.
  assert.match(fdate("2026-08-31"), /31/);
  assert.match(fdate("2026-09-01"), /01/);
  // El 1 de enero es el borde donde el desfase además cambia de año.
  assert.match(fdate("2027-01-01"), /01/);
  assert.match(fdate("2027-01-01"), /2027/);
});

test("fdate conserva el día LOCAL cuando le dan un instante completo", () => {
  // Con hora sí hay zona: las 02:00 UTC del 1 de septiembre son todavía el 31
  // de agosto en México, y esa es la respuesta correcta para un instante.
  const local = new Date("2026-09-01T02:00:00Z").getDate();
  assert.match(fdate("2026-09-01T02:00:00Z"), new RegExp(String(local).padStart(2, "0")));
});

test("fdate sin fecha devuelve un guion, no «Invalid Date»", () => {
  assert.strictEqual(fdate(null), "—");
  assert.strictEqual(fdate(undefined), "—");
  assert.strictEqual(fdate(""), "—");
});
