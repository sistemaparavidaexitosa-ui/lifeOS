import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slotsFor,
  slotStates,
  habitStreaks,
  completionRate,
  toggleEffect,
  type HabitSeries,
  type HabitLogEntry
} from "../../src/lib/domain/development/habit-analytics.ts";

// 2026-09-14 es lunes; 2026-09-15 es martes (HOY).
const HOY = "2026-09-15";
const DESDE = "2026-08-01";

const hecho = (date: string, pct = 100): HabitLogEntry => ({ date, status: "completed", pct });
const omitido = (date: string): HabitLogEntry => ({ date, status: "skipped", pct: 0 });
const pospuesto = (date: string): HabitLogEntry => ({ date, status: "postponed", pct: 0 });

function serie(frequency: HabitSeries["frequency"], logs: HabitLogEntry[], createdOn = "2026-01-01"): HabitSeries {
  return { habitId: "h1", frequency, createdOn, logs };
}

test("slotsFor: Entre semana da una ranura por día laborable", () => {
  const slots = slotsFor("Entre semana", "2026-09-11", "2026-09-15"); // vie..mar
  assert.deepEqual(slots.map((s) => s.key), ["2026-09-11", "2026-09-14", "2026-09-15"]);
});

test("slotsFor: Semanal da semanas ISO que empiezan en lunes, recortadas al rango", () => {
  const slots = slotsFor("Semanal", "2026-09-02", "2026-09-15");
  assert.deepEqual(
    slots.map((s) => [s.start, s.end]),
    [
      ["2026-08-31", "2026-09-06"],
      ["2026-09-07", "2026-09-13"],
      ["2026-09-14", "2026-09-20"]
    ]
  );
});

test("slotStates: el mejor registro de la ranura manda y hoy sin registro queda pendiente", () => {
  const s = serie("Semanal", [omitido("2026-09-08"), hecho("2026-09-10", 60)]);
  const estados = slotStates(s, "2026-09-07", HOY, HOY);
  assert.deepEqual(
    estados.map((e) => [e.state, e.pct]),
    [
      ["completed", 60],
      ["pending", 0]
    ]
  );
});

test("habitStreaks: hoy sin marcar no corta una racha diaria", () => {
  const s = serie("Diario", [hecho("2026-09-12"), hecho("2026-09-13"), hecho("2026-09-14")]);
  assert.deepEqual(habitStreaks(s, HOY, DESDE), { current: 3, longest: 3, unit: "día" });
});

test("habitStreaks: un pospuesto se salta sin cortar ni sumar", () => {
  const s = serie("Diario", [hecho("2026-09-12"), pospuesto("2026-09-13"), hecho("2026-09-14")]);
  assert.equal(habitStreaks(s, HOY, DESDE).current, 2);
});

test("habitStreaks: un omitido corta la racha", () => {
  const s = serie("Diario", [hecho("2026-09-12"), omitido("2026-09-13"), hecho("2026-09-14")]);
  assert.equal(habitStreaks(s, HOY, DESDE).current, 1);
});

test("habitStreaks: un día sin registro que ya pasó corta la racha", () => {
  const s = serie("Diario", [hecho("2026-09-12"), hecho("2026-09-14")]);
  assert.equal(habitStreaks(s, HOY, DESDE).current, 1);
});

test("habitStreaks: un hábito semanal cuenta semanas, sin importar el día", () => {
  const s = serie("Semanal", [hecho("2026-09-02"), hecho("2026-09-10")]);
  assert.deepEqual(habitStreaks(s, HOY, DESDE), { current: 2, longest: 2, unit: "semana" });
});

test("habitStreaks: Entre semana ignora el fin de semana", () => {
  const s = serie("Entre semana", [
    hecho("2026-09-07"),
    hecho("2026-09-08"),
    hecho("2026-09-09"),
    hecho("2026-09-10"),
    hecho("2026-09-11"),
    hecho("2026-09-14")
  ]);
  assert.equal(habitStreaks(s, "2026-09-14", DESDE).current, 6);
});

test("habitStreaks: la racha máxima sobrevive a un hueco", () => {
  const s = serie("Diario", [
    hecho("2026-09-05"),
    hecho("2026-09-06"),
    hecho("2026-09-07"),
    hecho("2026-09-08"),
    hecho("2026-09-09"),
    hecho("2026-09-13"),
    hecho("2026-09-14")
  ]);
  assert.deepEqual(habitStreaks(s, HOY, "2026-09-05"), { current: 2, longest: 5, unit: "día" });
});

test("habitStreaks: las ranuras anteriores a la creación del hábito no cuentan como huecos", () => {
  const s = serie("Diario", [hecho("2026-09-14")], "2026-09-14");
  assert.equal(habitStreaks(s, HOY, DESDE).current, 1);
});

test("completionRate: suma porcentajes y deja fuera pospuestos y el día pendiente", () => {
  const s = serie("Diario", [hecho("2026-09-11"), hecho("2026-09-12", 50), omitido("2026-09-13"), pospuesto("2026-09-14")]);
  // 11 (100) + 12 (50) + 13 (0) → 150 / 300. El 14 pospuesto y el 15 pendiente no cuentan.
  assert.equal(completionRate([s], "2026-09-11", HOY, HOY), 50);
});

test("completionRate: un día sin registro que ya pasó cuenta como 0", () => {
  const s = serie("Diario", [hecho("2026-09-13")]);
  assert.equal(completionRate([s], "2026-09-13", "2026-09-14", HOY), 50);
});

test("completionRate: null si no hay ninguna ranura que juzgar", () => {
  const nuevo = serie("Diario", [], HOY);
  assert.equal(completionRate([nuevo], "2026-09-01", HOY, HOY), null);
});

test("completionRate: combina varios hábitos ponderando por ranura", () => {
  const a = { ...serie("Diario", [hecho("2026-09-13"), hecho("2026-09-14")]), habitId: "a" };
  const b = { ...serie("Diario", [omitido("2026-09-13"), omitido("2026-09-14")]), habitId: "b" };
  assert.equal(completionRate([a, b], "2026-09-13", "2026-09-14", HOY), 50);
});

test("toggleEffect: marcar, desmarcar y convertir en hecho", () => {
  assert.equal(toggleEffect(null), "insert");
  assert.equal(toggleEffect("completed"), "delete");
  assert.equal(toggleEffect("skipped"), "complete");
  assert.equal(toggleEffect("postponed"), "complete");
});
