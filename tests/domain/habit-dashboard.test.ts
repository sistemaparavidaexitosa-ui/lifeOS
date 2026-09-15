import { test } from "node:test";
import assert from "node:assert/strict";
import type { HabitLogEntry, HabitSeries } from "../../src/lib/domain/development/habit-analytics.ts";
import {
  parseRango,
  dailyCurve,
  solidDaysStreak,
  disciplineIndex,
  successRate,
  weeklyTrend,
  periodRates,
  momentum,
  monthlyTrend,
  habitRows,
  streakSegments,
  areaOfCategory,
  areaRates,
  monthGrid
} from "../../src/lib/domain/development/habit-dashboard.ts";

// 2026-09-14 es lunes; 2026-09-15 es martes (HOY); 2026-09-13 es domingo.
const HOY = "2026-09-15";

const hecho = (date: string, pct = 100): HabitLogEntry => ({ date, status: "completed", pct });
const omitido = (date: string): HabitLogEntry => ({ date, status: "skipped", pct: 0 });
const pospuesto = (date: string): HabitLogEntry => ({ date, status: "postponed", pct: 0 });

function serie(habitId: string, frequency: HabitSeries["frequency"], logs: HabitLogEntry[], createdOn = "2026-01-01"): HabitSeries {
  return { habitId, frequency, createdOn, logs };
}

test("parseRango: acepta 7/30/90/365 y cae a 30 con cualquier otra cosa", () => {
  assert.equal(parseRango("7"), 7);
  assert.equal(parseRango("365"), 365);
  assert.equal(parseRango("abc"), 30);
  assert.equal(parseRango(undefined), 30);
});

test("dailyCurve: media de las ranuras diarias juzgadas, null sin nada juzgado", () => {
  const a = serie("a", "Diario", [hecho("2026-09-13"), hecho("2026-09-14", 50)]);
  const b = serie("b", "Entre semana", [omitido("2026-09-14")]);
  const curva = dailyCurve([a, b], "2026-09-13", HOY, HOY);
  assert.deepEqual(
    curva.map((p) => [p.date, p.pct, p.judged, p.done]),
    [
      ["2026-09-13", 100, 1, 1], // domingo: b no toca
      ["2026-09-14", 25, 2, 1], // (50 + 0) / 2
      ["2026-09-15", null, 0, 0] // hoy, todo pendiente
    ]
  );
});

test("dailyCurve: una semana completada cuenta en su domingo", () => {
  const w = serie("w", "Semanal", [hecho("2026-09-09")]);
  const curva = dailyCurve([w], "2026-09-12", "2026-09-13", HOY);
  assert.deepEqual(
    curva.map((p) => [p.date, p.pct]),
    [
      ["2026-09-12", null],
      ["2026-09-13", 100]
    ]
  );
});

test("dailyCurve: la semana en curso ya completada cuenta hoy", () => {
  const w = serie("w", "Semanal", [hecho("2026-09-14")]);
  const curva = dailyCurve([w], "2026-09-14", HOY, HOY);
  assert.deepEqual(curva.map((p) => p.pct), [null, 100]);
});

test("solidDaysStreak: hoy por debajo de 80 es neutro, un día flojo corta y los vacíos se saltan", () => {
  const curva = [
    { date: "2026-09-10", pct: 90, judged: 1, done: 1 },
    { date: "2026-09-11", pct: 60, judged: 1, done: 0 },
    { date: "2026-09-12", pct: 100, judged: 1, done: 1 },
    { date: "2026-09-13", pct: null, judged: 0, done: 0 },
    { date: "2026-09-14", pct: 80, judged: 1, done: 1 },
    { date: "2026-09-15", pct: 40, judged: 1, done: 0 }
  ];
  assert.equal(solidDaysStreak(curva, HOY), 2);
});

test("disciplineIndex: días sólidos entre días juzgados; hoy incompleto no cuenta en contra", () => {
  const curva = [
    { date: "2026-09-12", pct: 100, judged: 1, done: 1 },
    { date: "2026-09-13", pct: 50, judged: 2, done: 1 },
    { date: "2026-09-14", pct: null, judged: 0, done: 0 },
    { date: "2026-09-15", pct: 0, judged: 1, done: 0 }
  ];
  assert.equal(disciplineIndex(curva, HOY), 50);
  assert.equal(disciplineIndex([], HOY), null);
});

test("successRate: cuenta ranuras, no porcentajes, y deja fuera pospuestos", () => {
  const a = serie("a", "Diario", [hecho("2026-09-11", 30), omitido("2026-09-12"), pospuesto("2026-09-13")]);
  // 11 hecho (aunque sea al 30 %), 12 omitido, 13 pospuesto, 14 sin registro → 1 / 3
  assert.equal(successRate([a], "2026-09-11", "2026-09-14", HOY), 33);
});

test("weeklyTrend: una entrada por semana ISO desde la semana de `from`", () => {
  const a = serie("a", "Diario", [hecho("2026-09-07"), hecho("2026-09-14")]);
  const semanas = weeklyTrend([a], "2026-09-09", HOY);
  assert.deepEqual(semanas.map((s) => s.weekStart), ["2026-09-07", "2026-09-14"]);
  assert.equal(semanas[0]!.pct, 14); // 1 de 7
  assert.equal(semanas[1]!.pct, 100); // lunes hecho, martes pendiente
});

test("periodRates: cada periodo natural hasta hoy", () => {
  const a = serie("a", "Diario", [hecho("2026-09-14"), omitido("2026-09-13"), hecho(HOY)]);
  const r = periodRates([a], HOY);
  assert.equal(r.day, 100);
  assert.equal(r.week, 100); // lunes y martes
  assert.ok(r.month !== null && r.month < 100);
  assert.ok(r.year !== null && r.quarter !== null);
});

test("momentum y monthlyTrend: diferencias en puntos", () => {
  const logs: HabitLogEntry[] = [];
  // Un hábito nacido hace 7 días y cumplido todos: la ventana de 30 días no ve nada más.
  for (let i = 1; i <= 7; i++) logs.push(hecho(`2026-09-${String(15 - i).padStart(2, "0")}`));
  const a = serie("a", "Diario", logs, "2026-09-08");
  assert.equal(momentum([a], HOY), 0); // el hábito nació hace 7 días: las dos ventanas ven lo mismo
  const b = serie("b", "Diario", [hecho("2026-09-14")], "2026-07-01");
  const t = monthlyTrend([b], HOY);
  assert.equal(t.previous, 0);
  assert.equal(t.delta, t.current);
});

test("habitRows: consistencia, rachas y omisiones del rango", () => {
  const a = serie("a", "Diario", [hecho("2026-09-13"), hecho("2026-09-14"), omitido("2026-09-12")], "2026-09-01");
  const [fila] = habitRows([a], "2026-09-10", HOY);
  assert.equal(fila!.current, 2);
  assert.equal(fila!.rateRange, 40); // 10 y 11 sin registro, 12 omitido, 13 y 14 hechos
  assert.equal(fila!.misses, 3);
  assert.equal(fila!.rate30, 14); // 2 de 14 días desde que existe
  // Los dos hechos caen en la última semana, que pesa el doble: 0,7 × 20 + 0,3 × 14.
  assert.equal(fila!.consistency, 18);
});

test("streakSegments: corridas de completados; un pospuesto no corta", () => {
  const a = serie("a", "Diario", [hecho("2026-09-10"), hecho("2026-09-11"), pospuesto("2026-09-12"), hecho("2026-09-13"), hecho(HOY)]);
  assert.deepEqual(streakSegments([a], "2026-09-10", HOY), [
    { habitId: "a", start: "2026-09-10", end: "2026-09-13", length: 3 },
    { habitId: "a", start: HOY, end: HOY, length: 1 }
  ]);
});

test("areaOfCategory y areaRates: agrupa por área de vida", () => {
  assert.equal(areaOfCategory("Trabajo"), "Carrera");
  assert.equal(areaOfCategory("Otros"), "Personal");
  const a = serie("a", "Diario", [hecho("2026-09-14")], "2026-09-14");
  const b = serie("b", "Diario", [omitido("2026-09-14")], "2026-09-14");
  const areas = areaRates([a, b], (id) => (id === "a" ? "Salud" : "Carrera"), HOY);
  assert.deepEqual(areas, [
    { area: "Carrera", pct: 0 },
    { area: "Salud", pct: 100 }
  ]);
});

test("monthGrid: semanas de lunes a domingo con huecos fuera del mes", () => {
  const g = monthGrid("2026-09");
  assert.deepEqual(g[0], [null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]);
  assert.equal(g.at(-1)!.filter(Boolean).at(-1), "2026-09-30");
  assert.ok(g.every((w) => w.length === 7));
});
