// tests/domain/centro-agente-inversiones.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerParametrosInversiones, seccionesDeInversiones } from "../../src/lib/domain/centro/agente/inversiones.ts";
import { validarPorSeccion } from "../../src/lib/domain/centro/runtime/validador.ts";
import { money } from "../../src/lib/format.ts";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";

const mov = (id: string, kind: "aportacion" | "retiro" | "rendimiento" | "valuacion", amount: number, occurred_on: string) => ({
  id,
  kind,
  amount,
  occurred_on,
  created_at: `${occurred_on}T12:00:00Z`,
  note: ""
});

const posiciones = [
  { id: P1, name: "CETES 28d", currency: "MXN", movimientos: [mov("m1", "aportacion", 1000, "2026-01-01"), mov("m2", "valuacion", 1100, "2026-02-01")] },
  { id: P2, name: "Fibra", currency: "MXN", movimientos: [mov("m3", "aportacion", 500, "2026-01-15")] },
  { id: P3, name: "VOO", currency: "USD", movimientos: [mov("m4", "aportacion", 99, "2026-01-10")] }
];
const base = { moneda: "MXN", locale: "es-MX", hoy: "2026-03-01", posiciones };

test("Parámetros: global por defecto; acepta el uuid solo o como fila", () => {
  assert.deepStrictEqual(leerParametrosInversiones({}), { vista: "global", posicion: null });
  assert.deepStrictEqual(leerParametrosInversiones({ vista: "posicion", posicion: `fila:investments:${P1}` }), { vista: "posicion", posicion: P1 });
  assert.deepStrictEqual(leerParametrosInversiones({ vista: "posicion", posicion: P1 }), { vista: "posicion", posicion: P1 });
  assert.deepStrictEqual(leerParametrosInversiones({ vista: "volar", posicion: "no-uuid" }), { vista: "global", posicion: null });
});

test("Global: total, nota con capital, rendimiento y lo que no suma, y la curva", () => {
  const [s] = seccionesDeInversiones({ ...base, parametros: { vista: "global", posicion: null } });
  assert.ok(s && s.kind === "portfolio");
  assert.strictEqual(s.data.total, money(1600, "MXN", "es-MX"));
  assert.match(s.data.nota, /Capital aportado/);
  assert.match(s.data.nota, /\+6\.7%/);
  assert.match(s.data.nota, /1 posición en otra moneda no suma/);
  assert.deepStrictEqual(s.data.serie.map((p) => p.y), [1000, 1500, 1600, 1600]);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Global sin nada en tu moneda: vacío que lo dice", () => {
  const [s] = seccionesDeInversiones({ ...base, posiciones: [posiciones[2]!], parametros: { vista: "global", posicion: null } });
  assert.ok(s && s.kind === "emptyState");
  assert.match(s.data.mensaje, /otra moneda/);
});

test("Posición: su valor en SU moneda, con su nombre de título", () => {
  const [s] = seccionesDeInversiones({ ...base, parametros: { vista: "posicion", posicion: P3 } });
  assert.ok(s && s.kind === "portfolio");
  assert.strictEqual(s.title, "VOO");
  assert.strictEqual(s.data.total, money(99, "USD", "es-MX"));
});

test("Posición que no existe (o no es tuya): vacío, nunca la de otro", () => {
  const [s] = seccionesDeInversiones({ ...base, parametros: { vista: "posicion", posicion: "99999999-9999-4999-8999-999999999999" } });
  assert.ok(s && s.kind === "emptyState");
  assert.strictEqual(s.data.mensaje, "No encuentro esa inversión.");
});

test("Movimientos: tabla de los más recientes, con enlace a /investments", () => {
  const [s] = seccionesDeInversiones({ ...base, parametros: { vista: "movimientos", posicion: null } });
  assert.ok(s && s.kind === "table");
  assert.deepStrictEqual(s.data.columnas, ["Fecha", "Posición", "Tipo", "Monto"]);
  assert.strictEqual(s.data.filas[0]!.celdas[1], "CETES 28d");
  assert.strictEqual(s.data.filas[0]!.celdas[2], "Valuación");
  assert.strictEqual(s.data.filas[0]!.href, "/investments");
  assert.strictEqual(s.data.filas.length, 4);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Movimientos de una posición sin movimientos: vacío", () => {
  const vacia = { id: P1, name: "Nueva", currency: "MXN", movimientos: [] };
  const [s] = seccionesDeInversiones({ ...base, posiciones: [vacia], parametros: { vista: "movimientos", posicion: P1 } });
  assert.ok(s && s.kind === "emptyState");
});
