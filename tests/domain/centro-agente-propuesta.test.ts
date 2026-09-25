// tests/domain/centro-agente-propuesta.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearRespuesta } from "../../src/lib/domain/centro/agente/contrato.ts";
import { resolverPropuesta } from "../../src/lib/domain/centro/agente/propuesta-movimiento.ts";
import { validarPorSeccion } from "../../src/lib/domain/centro/runtime/validador.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const FILA = `fila:investments:${ID}`;
const b = (datos: unknown) => ({ kind: "propuesta_movimiento", datos: JSON.stringify(datos) });
const turno = (datos: unknown) => parsearRespuesta({ texto: "¿Lo guardo?", bloques: [b(datos)] });

test("Contrato: una propuesta bien formada pasa", () => {
  const r = turno({ fila: FILA, tipo: "aportacion", monto: 5000, fecha: "2026-09-20", nota: null });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques, [{ kind: "propuesta_movimiento", fila: FILA, tipo: "aportacion", monto: 5000, fecha: "2026-09-20", nota: null }]);
});

test("Contrato: fila de otra tabla, tipo desconocido, monto 0 en un flujo: fuera", () => {
  for (const datos of [
    { fila: `fila:debts:${ID}`, tipo: "aportacion", monto: 1, fecha: null, nota: null },
    { fila: FILA, tipo: "compra", monto: 1, fecha: null, nota: null },
    { fila: FILA, tipo: "aportacion", monto: 0, fecha: null, nota: null },
    { fila: FILA, tipo: "retiro", monto: -5, fecha: null, nota: null }
  ]) {
    const r = turno(datos);
    assert.ok(r.ok);
    assert.strictEqual(r.ok && r.value.bloques.length, 0, JSON.stringify(datos));
  }
});

test("Contrato: una valuación en 0 sí pasa", () => {
  const r = turno({ fila: FILA, tipo: "valuacion", monto: 0, fecha: null, nota: null });
  assert.strictEqual(r.ok && r.value.bloques.length, 1);
});

const fila = { id: ID, name: "CETES 28d", currency: "MXN" };
const ctx = { filas: new Map([[FILA, fila]]), hoy: "2026-09-25", moneda: "MXN" };
const bloque = { kind: "propuesta_movimiento" as const, fila: FILA, tipo: "aportacion" as const, monto: 5000.004, fecha: null, nota: "Quincena" };

test("Resolver: sin fecha es hoy; nombre y moneda salen de la fila leída, no del modelo", () => {
  const r = resolverPropuesta(bloque, "b0", ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.seccion, {
    id: "b0",
    kind: "propuestaMovimiento",
    data: { investmentId: ID, posicion: "CETES 28d", moneda: "MXN", tipo: "aportacion", monto: 5000, fecha: "2026-09-25", nota: "Quincena" }
  });
  assert.strictEqual(validarPorSeccion([r.ok ? r.seccion : (null as never)], [], "test").length, 1);
});

test("Resolver: una posición que el modelo no leyó en este turno no se propone", () => {
  const r = resolverPropuesta(bloque, "b0", { ...ctx, filas: new Map() });
  assert.deepStrictEqual(r, { ok: false, reason: `«propuesta_movimiento»: ${FILA} no se leyó en este turno.` });
});

test("Resolver: ni futura ni de hace más de diez años", () => {
  assert.strictEqual(resolverPropuesta({ ...bloque, fecha: "2026-09-26" }, "b0", ctx).ok, false);
  // 3653 días atrás desde 2026-09-25 es 2016-09-24 (2020 y 2024 son bisiestos).
  assert.strictEqual(resolverPropuesta({ ...bloque, fecha: "2016-09-23" }, "b0", ctx).ok, false);
  assert.strictEqual(resolverPropuesta({ ...bloque, fecha: "2016-09-24" }, "b0", ctx).ok, true);
});

test("Validador: propuestaMovimiento con campo de más o sin uuid, fuera", () => {
  const buena = { id: "b0", kind: "propuestaMovimiento", data: { investmentId: ID, posicion: "X", moneda: "MXN", tipo: "retiro", monto: 10, fecha: "2026-09-25", nota: null } } as const;
  assert.strictEqual(validarPorSeccion([buena], [], "test").length, 1);
  assert.strictEqual(validarPorSeccion([{ ...buena, data: { ...buena.data, investmentId: "x" } }] as never, [], "test").length, 0);
  assert.strictEqual(validarPorSeccion([{ ...buena, data: { ...buena.data, extra: 1 } }] as never, [], "test").length, 0);
});
