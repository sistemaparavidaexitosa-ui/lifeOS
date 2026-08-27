import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableSlots,
  saturationStatus,
  timeToMin,
  minToTime,
  occupationAppliesOn,
  daysLabel
} from "../../src/lib/domain/time.ts";

// 2026-08-24 es lunes (getUTCDay 1), 2026-08-29 sábado (6), 2026-08-30 domingo (0).
// La convención de `days` es la de getUTCDay: 0 = domingo … 6 = sábado.

test("occupationAppliesOn: una recurrente de lunes a viernes no aplica el domingo", () => {
  const occ = { recurring: true, occDate: null, days: [1, 2, 3, 4, 5] };
  assert.strictEqual(occupationAppliesOn(occ, "2026-08-24"), true); // lunes
  assert.strictEqual(occupationAppliesOn(occ, "2026-08-30"), false); // domingo
});

test("occupationAppliesOn: el domingo es 0, no 7", () => {
  assert.strictEqual(occupationAppliesOn({ recurring: true, occDate: null, days: [0] }, "2026-08-30"), true);
  assert.strictEqual(occupationAppliesOn({ recurring: true, occDate: null, days: [7] }, "2026-08-30"), false);
});

test("occupationAppliesOn: el sábado es 6 — el borde donde se equivoca quien piense en ISO", () => {
  const sabado = { recurring: true, occDate: null, days: [6] };
  assert.strictEqual(occupationAppliesOn(sabado, "2026-08-29"), true);
  assert.strictEqual(occupationAppliesOn(sabado, "2026-08-30"), false);
});

test("occupationAppliesOn: con los siete días aplica siempre (comportamiento previo a la columna)", () => {
  const todos = { recurring: true, occDate: null, days: [0, 1, 2, 3, 4, 5, 6] };
  for (const d of ["2026-08-24", "2026-08-29", "2026-08-30"]) {
    assert.strictEqual(occupationAppliesOn(todos, d), true);
  }
});

test("occupationAppliesOn: la no recurrente solo aplica en su fecha, e ignora days", () => {
  // days dice "todos los días", pero la ocupación tiene fecha: manda la fecha.
  const occ = { recurring: false, occDate: "2026-08-24", days: [0, 1, 2, 3, 4, 5, 6] };
  assert.strictEqual(occupationAppliesOn(occ, "2026-08-24"), true);
  assert.strictEqual(occupationAppliesOn(occ, "2026-08-25"), false);
});

test("occupationAppliesOn: recurrente sin ningún día no aplica nunca", () => {
  assert.strictEqual(occupationAppliesOn({ recurring: true, occDate: null, days: [] }, "2026-08-24"), false);
});

test("daysLabel: los casos frecuentes tienen nombre, no letras", () => {
  assert.strictEqual(daysLabel([0, 1, 2, 3, 4, 5, 6]), "todos los días");
  assert.strictEqual(daysLabel([1, 2, 3, 4, 5]), "entre semana");
  assert.strictEqual(daysLabel([0, 6]), "fin de semana");
});

test("daysLabel: el resto se deletrea empezando en lunes, aunque el domingo valga 0", () => {
  // {0,1,3} es el dato que ya existía en producción: domingo, lunes, miércoles.
  assert.strictEqual(daysLabel([0, 1, 3]), "L·X·D");
  assert.strictEqual(daysLabel([3, 1, 0]), "L·X·D"); // el orden de entrada no importa
});

test("daysLabel: sin días lo dice, en vez de devolver una cadena vacía", () => {
  assert.strictEqual(daysLabel([]), "ningún día");
});

test("timeToMin / minToTime son inversas", () => {
  assert.strictEqual(timeToMin("09:30"), 570);
  assert.strictEqual(minToTime(570), "09:30");
});

test("availableSlots: sin ocupaciones, todo el rango de actividad está libre (FR-TIM-003)", () => {
  const slots = availableSlots({ start: "05:00", end: "21:00" }, []);
  assert.strictEqual(slots.length, 1);
  assert.strictEqual(slots[0]!.start, "05:00");
  assert.strictEqual(slots[0]!.end, "21:00");
});

test("availableSlots: calcula el complemento de una ocupación dentro del rango", () => {
  const slots = availableSlots({ start: "05:00", end: "21:00" }, [
    { id: "o1", title: "Reunión", start: "09:00", end: "10:00" }
  ]);
  assert.strictEqual(slots.length, 2);
  assert.strictEqual(slots[0]!.end, "09:00");
  assert.strictEqual(slots[1]!.start, "10:00");
});

test("availableSlots: fusiona ocupaciones traslapadas", () => {
  const slots = availableSlots({ start: "08:00", end: "18:00" }, [
    { id: "o1", title: "A", start: "09:00", end: "11:00" },
    { id: "o2", title: "B", start: "10:00", end: "12:00" }
  ]);
  // deben fusionarse en un solo bloque 09:00-12:00 -> 2 huecos: 08-09 y 12-18
  assert.strictEqual(slots.length, 2);
  assert.strictEqual(slots[0]!.end, "09:00");
  assert.strictEqual(slots[1]!.start, "12:00");
});

test("saturationStatus: ok cuando el compromiso es bajo", () => {
  const s = saturationStatus({ start: "05:00", end: "21:00" }, [], 60);
  assert.strictEqual(s.status, "ok");
});

test("saturationStatus: saturated cuando se excede el 100% de la capacidad (BR-017/018)", () => {
  const s = saturationStatus(
    { start: "09:00", end: "10:00" }, // 60 min de capacidad
    [],
    120 // 120 min de tareas de impacto
  );
  assert.strictEqual(s.status, "saturated");
  assert.strictEqual(s.availableMinutes, 0);
});

test("saturationStatus: ocupaciones fuera del rango de actividad no cuentan (BR-017)", () => {
  const s = saturationStatus(
    { start: "09:00", end: "17:00" },
    [{ id: "o1", title: "Madrugada", start: "02:00", end: "04:00" }],
    0
  );
  assert.strictEqual(s.occupiedMinutes, 0);
});
