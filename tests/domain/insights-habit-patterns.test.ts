import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysISO } from "../../src/lib/domain/datetime.ts";
import type { HabitLogEntry, HabitSeries } from "../../src/lib/domain/development/habit-analytics.ts";
import { habitPatternsFacts, type PatternsSnapshot } from "../../src/lib/domain/insights/facts/habit-patterns.ts";

// 2026-09-15 es martes. Las series cubren 12 semanas hacia atrás.
const HOY = "2026-09-15";
const INICIO = addDaysISO(HOY, -84);

function dias(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta; d = addDaysISO(d, 1)) out.push(d);
  return out;
}
const PASADOS = dias(INICIO, addDaysISO(HOY, -1));
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

function serie(habitId: string, hecho: (d: string, i: number) => boolean): HabitSeries {
  const logs: HabitLogEntry[] = PASADOS.map((date, i) =>
    hecho(date, i) ? { date, status: "completed", pct: 100 } : { date, status: "skipped", pct: 0 }
  );
  return { habitId, frequency: "Diario", createdOn: INICIO, logs };
}

function base(extra: Partial<PatternsSnapshot> = {}): PatternsSnapshot {
  return {
    today: HOY,
    habits: [
      { id: "meditar", name: "Meditar", routineId: "manana" },
      { id: "leer", name: "Leer", routineId: "manana" },
      { id: "ejercicio", name: "Ejercicio", routineId: "manana" }
    ],
    routines: [{ id: "manana", name: "Mañana Milagrosa" }],
    series: [],
    checkins: [],
    ...extra
  };
}

const ids = (s: PatternsSnapshot) => habitPatternsFacts(s).map((f) => f.id);

test("con menos de 6 semanas de datos no hay tendencias ni correlaciones", () => {
  const corto = (habitId: string): HabitSeries => ({ ...serie(habitId, () => true), createdOn: addDaysISO(HOY, -20) });
  const s = base({ series: [corto("meditar"), corto("leer"), corto("ejercicio")] });
  assert.ok(!ids(s).some((id) => id.includes("weekday") || id.includes("lift") || id.includes("sleep")));
});

test("estado: cumplimiento de la rutina a 90 días con kind estado", () => {
  const s = base({ series: [serie("meditar", () => true), serie("leer", () => true), serie("ejercicio", (_, i) => i % 5 !== 0)] });
  const f = habitPatternsFacts(s).find((x) => x.id === "habits.routine-rate.manana")!;
  assert.equal(f.kind, "estado");
  assert.match(f.label, /Mañana Milagrosa/);
  assert.match(f.label, /93 %/);
});

test("tendencia: los viernes bajan 15 puntos o más", () => {
  const flojoElViernes = (d: string) => dow(d) !== 5;
  const s = base({ series: [serie("meditar", flojoElViernes), serie("leer", flojoElViernes), serie("ejercicio", (d) => dow(d) !== 5)] });
  const f = habitPatternsFacts(s).find((x) => x.id === "habits.weekday-dip.5");
  assert.ok(f, "debería detectar el bajón del viernes");
  assert.equal(f!.kind, "tendencia");
  assert.match(f!.label, /viernes/);
});

test("correlación: los días que medita cumple mucho más el resto; habla de asociación, no de causa", () => {
  const medita = (_: string, i: number) => i % 3 !== 0;
  const s = base({
    series: [serie("meditar", medita), serie("leer", (d, i) => medita(d, i)), serie("ejercicio", (d, i) => medita(d, i) && i % 7 !== 1)]
  });
  const f = habitPatternsFacts(s).find((x) => x.id === "habits.lift.meditar");
  assert.ok(f);
  assert.equal(f!.kind, "correlacion");
  assert.doesNotMatch(f!.label, /porque|causa|hace que/i);
});

test("correlación: sin diferencia real entre días con y sin el hábito no hay hecho", () => {
  const s = base({ series: [serie("meditar", (_, i) => i % 2 === 0), serie("leer", (_, i) => i % 3 !== 0), serie("ejercicio", (_, i) => i % 3 !== 1)] });
  assert.ok(!ids(s).some((id) => id.startsWith("habits.lift.meditar")));
});

test("correlación con el sueño: con menos de 6 h se omite el ejercicio", () => {
  const pocoSueno = (i: number) => i % 4 === 0;
  const s = base({
    series: [serie("meditar", () => true), serie("leer", () => true), serie("ejercicio", (_, i) => !pocoSueno(i))],
    checkins: PASADOS.map((date, i) => ({ date, mood: 3, energy: 3, sleepHours: pocoSueno(i) ? 5 : 7.5 }))
  });
  const f = habitPatternsFacts(s).find((x) => x.id === "habits.sleep.ejercicio");
  assert.ok(f);
  assert.match(f!.label, /menos de 6 h/);
  assert.equal(f!.refs[0]!.table, "daily_reflections");
});

test("el hábito más omitido de los últimos 30 días", () => {
  const s = base({ series: [serie("meditar", () => true), serie("leer", () => true), serie("ejercicio", (_, i) => i % 2 === 0)] });
  assert.ok(ids(s).includes("habits.most-skipped.ejercicio"));
});
