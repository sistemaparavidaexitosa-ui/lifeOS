// tests/domain/curva-inversion.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CASOS_COMPARTIDOS,
  estadoAl,
  valorAl,
  curvaDePosicion,
  curvaGlobal,
  rendimientoPct,
  recortarCurva,
  retiroPermitido,
  borradoPermitido,
  type MovimientoPuro
} from "../../src/lib/domain/money/curva-inversion.ts";

// LA MISMA TABLA vive en supabase/tests/0047_movimientos_de_inversion.sql
// contra el trigger. Si una cambia, la otra también.
for (const c of CASOS_COMPARTIDOS) {
  test(`Caso compartido ${c.nombre}`, () => {
    const ultimo = c.movs.reduce((f, m) => (m.occurred_on > f ? m.occurred_on : f), "0000-00-00");
    assert.deepStrictEqual(estadoAl(c.movs, ultimo), c.esperado);
  });
}

test("Sin movimientos: 0 y 0, y curva vacía", () => {
  assert.deepStrictEqual(estadoAl([], "2026-09-25"), { valor: 0, capital: 0 });
  assert.deepStrictEqual(curvaDePosicion([], "2026-09-25"), []);
});

const m = (kind: MovimientoPuro["kind"], amount: number, occurred_on: string, created_at = `${occurred_on}T12:00:00Z`): MovimientoPuro => ({
  kind,
  amount,
  occurred_on,
  created_at
});

test("Lo que pasa después de la fecha no cuenta", () => {
  const movs = [m("aportacion", 1000, "2026-01-01"), m("aportacion", 500, "2026-03-01")];
  assert.deepStrictEqual(estadoAl(movs, "2026-02-01"), { valor: 1000, capital: 1000 });
  assert.strictEqual(valorAl(movs, "2025-12-31"), 0);
});

test("Curva de una posición: un punto por fecha con movimiento, más hoy arrastrando el último", () => {
  const movs = [m("aportacion", 1000, "2026-01-01"), m("valuacion", 1100, "2026-02-01"), m("aportacion", 200, "2026-02-01")];
  assert.deepStrictEqual(curvaDePosicion(movs, "2026-03-01"), [
    { fecha: "2026-01-01", valor: 1000, capital: 1000 },
    { fecha: "2026-02-01", valor: 1100, capital: 1200 },
    { fecha: "2026-03-01", valor: 1100, capital: 1200 }
  ]);
});

test("Curva de una posición: si el último movimiento es hoy, no se repite el punto", () => {
  const movs = [m("aportacion", 1000, "2026-09-25")];
  assert.deepStrictEqual(curvaDePosicion(movs, "2026-09-25"), [{ fecha: "2026-09-25", valor: 1000, capital: 1000 }]);
});

test("Curva global: arrastra cada posición entre sus movimientos y no suma otra moneda", () => {
  const r = curvaGlobal(
    [
      { currency: "MXN", movimientos: [m("aportacion", 1000, "2026-01-01")] },
      { currency: "MXN", movimientos: [m("aportacion", 500, "2026-02-01"), m("valuacion", 600, "2026-03-01")] },
      { currency: "USD", movimientos: [m("aportacion", 99, "2026-01-15")] }
    ],
    "MXN",
    "2026-04-01"
  );
  assert.strictEqual(r.fuera, 1);
  assert.deepStrictEqual(r.puntos, [
    { fecha: "2026-01-01", valor: 1000, capital: 1000 },
    { fecha: "2026-02-01", valor: 1500, capital: 1500 },
    { fecha: "2026-03-01", valor: 1600, capital: 1500 },
    { fecha: "2026-04-01", valor: 1600, capital: 1500 }
  ]);
});

test("Curva global sin nada en tu moneda: vacía, y dice cuántas quedaron fuera", () => {
  const r = curvaGlobal([{ currency: "USD", movimientos: [m("aportacion", 1, "2026-01-01")] }], "MXN", "2026-02-01");
  assert.deepStrictEqual(r, { puntos: [], fuera: 1 });
});

test("Rendimiento simple, y null sin capital", () => {
  assert.strictEqual(rendimientoPct({ valor: 1100, capital: 1000 }), 10);
  assert.strictEqual(rendimientoPct({ valor: 950, capital: 1000 }), -5);
  assert.strictEqual(rendimientoPct({ valor: 1003.33, capital: 1000 }), 0.3);
  assert.strictEqual(rendimientoPct({ valor: 50, capital: 0 }), null);
});

test("Recortar conserva primero y último y no pasa del tope", () => {
  const puntos = Array.from({ length: 1000 }, (_, i) => i);
  const r = recortarCurva(puntos, 400);
  assert.strictEqual(r.length, 400);
  assert.strictEqual(r[0], 0);
  assert.strictEqual(r[399], 999);
  assert.deepStrictEqual(recortarCurva([1, 2, 3], 400), [1, 2, 3]);
});

test("Un retiro no puede dejar la posición bajo cero en su fecha", () => {
  const movs = [m("aportacion", 1000, "2026-01-01"), m("valuacion", 800, "2026-02-01")];
  assert.strictEqual(retiroPermitido(movs, { amount: 800, occurred_on: "2026-02-10" }), true);
  assert.strictEqual(retiroPermitido(movs, { amount: 800.01, occurred_on: "2026-02-10" }), false);
  // Antes de la valuación, valía 1000.
  assert.strictEqual(retiroPermitido(movs, { amount: 1000, occurred_on: "2026-01-15" }), true);
});

test("Un retiro con fecha atrás no puede dejar negativo lo que viene después", () => {
  // 1000 el 01-01 y retiro de 800 el 03-01. Un retiro de 500 el 02-01 cabe ese
  // día (vale 1000) pero desde el 03-01 dejaría −300.
  const movs = [m("aportacion", 1000, "2026-01-01"), m("retiro", 800, "2026-03-01")];
  assert.strictEqual(retiroPermitido(movs, { amount: 500, occurred_on: "2026-02-01" }), false);
  assert.strictEqual(retiroPermitido(movs, { amount: 200, occurred_on: "2026-02-01" }), true);
});

test("Una valuación posterior manda: el retiro anterior a ella no la vuelve negativa", () => {
  const movs = [m("aportacion", 1000, "2026-01-01"), m("valuacion", 900, "2026-03-01"), m("retiro", 800, "2026-04-01")];
  assert.strictEqual(retiroPermitido(movs, { amount: 1000, occurred_on: "2026-02-01" }), true);
});

test("Borrar un movimiento no puede dejar la posición bajo cero", () => {
  const movs = [
    { ...m("aportacion", 1000, "2026-01-01"), id: "a" },
    { ...m("aportacion", 500, "2026-01-15"), id: "b" },
    { ...m("retiro", 800, "2026-03-01"), id: "r" }
  ];
  assert.strictEqual(borradoPermitido(movs, "a"), false);
  assert.strictEqual(borradoPermitido(movs, "b"), true);
  assert.strictEqual(borradoPermitido(movs, "r"), true);
});
