import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarCaptura } from "../../src/lib/domain/execution/captura.ts";
import { siguientePaso } from "../../src/lib/domain/execution/avance.ts";

// 2026-10-24 es sábado.
const HOY = "2026-10-24";

test("sin marcas, el texto entero es el título", () => {
  assert.deepEqual(interpretarCaptura("Revisar contrato", HOY), { titulo: "Revisar contrato", due: null, priority: null, urgent: false });
});

test("hoy, mañana y pasado al final", () => {
  assert.equal(interpretarCaptura("Pagar luz hoy", HOY).due, "2026-10-24");
  assert.equal(interpretarCaptura("Pagar luz mañana", HOY).due, "2026-10-25");
  assert.equal(interpretarCaptura("Pagar luz manana", HOY).due, "2026-10-25");
  assert.equal(interpretarCaptura("Pagar luz pasado", HOY).due, "2026-10-26");
  assert.equal(interpretarCaptura("Pagar luz mañana", HOY).titulo, "Pagar luz");
});

test("día de la semana: el próximo, y el mismo día es la semana que viene", () => {
  assert.equal(interpretarCaptura("Llamar a Ana viernes", HOY).due, "2026-10-30");
  assert.equal(interpretarCaptura("Llamar a Ana lunes", HOY).due, "2026-10-26");
  assert.equal(interpretarCaptura("Llamar a Ana sábado", HOY).due, "2026-10-31");
});

test("fecha corta día/mes, pasando al año siguiente si ya pasó", () => {
  assert.equal(interpretarCaptura("Renovar 15/11", HOY).due, "2026-11-15");
  assert.equal(interpretarCaptura("Renovar 3/2", HOY).due, "2027-02-03");
  assert.equal(interpretarCaptura("Renovar 31/2", HOY).due, null);
});

test("prioridad y urgencia en cualquier orden al final", () => {
  const r = interpretarCaptura("Llamar a Ana mañana alta !", HOY);
  assert.deepEqual(r, { titulo: "Llamar a Ana", due: "2026-10-25", priority: "High", urgent: true });
  assert.equal(interpretarCaptura("Llamar a Ana baja viernes", HOY).priority, "Low");
});

test("«para el viernes» no deja colgando el «para el»", () => {
  const r = interpretarCaptura("Mandar propuesta para el viernes", HOY);
  assert.equal(r.titulo, "Mandar propuesta");
  assert.equal(r.due, "2026-10-30");
});

test("una palabra en medio de la frase se respeta", () => {
  const r = interpretarCaptura("Preparar la junta de mañana con Luis", HOY);
  assert.equal(r.titulo, "Preparar la junta de mañana con Luis");
  assert.equal(r.due, null);
});

test("nunca se queda sin título", () => {
  assert.equal(interpretarCaptura("mañana", HOY).titulo, "mañana");
  assert.equal(interpretarCaptura("alta", HOY).priority, null);
});

test("cada marca se reconoce una sola vez", () => {
  const r = interpretarCaptura("Tarea baja alta", HOY);
  assert.equal(r.priority, "High");
  assert.equal(r.titulo, "Tarea baja");
});

test("siguientePaso sigue el camino feliz y respeta lo cerrado", () => {
  assert.equal(siguientePaso("Pending"), "InProgress");
  assert.equal(siguientePaso("InProgress"), "Completed");
  assert.equal(siguientePaso("Blocked"), "InProgress");
  assert.equal(siguientePaso("Rescheduled"), "Pending");
  assert.equal(siguientePaso("Completed"), null);
  assert.equal(siguientePaso("Cancelled"), null);
});
