import { test } from "node:test";
import assert from "node:assert/strict";
import { availableSlots, saturationStatus, timeToMin, minToTime } from "../../src/lib/domain/time.ts";

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
