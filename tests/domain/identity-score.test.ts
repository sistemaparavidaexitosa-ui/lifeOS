import { test } from "node:test";
import assert from "node:assert/strict";
import type { HabitLogEntry, HabitSeries } from "../../src/lib/domain/development/habit-analytics.ts";
import {
  identityScore,
  resolveHabitAreas,
  FORMULA_VERSION,
  type ScoreInputs
} from "../../src/lib/domain/identity/score.ts";

// 2026-09-15 es martes.
const HOY = "2026-09-15";

const hecho = (date: string): HabitLogEntry => ({ date, status: "completed", pct: 100 });

function serie(habitId: string, logs: HabitLogEntry[], createdOn = "2026-09-12"): HabitSeries {
  return { habitId, frequency: "Diario", createdOn, logs };
}

/** Dos hábitos desde el sábado 12: «a» hecho los tres días pasados, «b» ninguno. */
function base(extra: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    today: HOY,
    series: [serie("a", [hecho("2026-09-12"), hecho("2026-09-13"), hecho("2026-09-14")]), serie("b", [])],
    habitAreas: { a: "Salud", b: "Finanzas" },
    traits: [],
    votes: [],
    goals: [],
    routineAdherence: [],
    reflectionDays: [],
    ...extra
  };
}

const valor = (r: ReturnType<typeof identityScore>, key: string) => r.components.find((c) => c.key === key)?.value;

test("sin hábitos no hay puntuación, aunque haya metas o reflexión", () => {
  const r = identityScore({ ...base(), series: [], habitAreas: {}, reflectionDays: [HOY] });
  assert.equal(r.score, null);
  assert.equal(r.formulaVersion, FORMULA_VERSION);
});

test("los componentes ausentes no cuentan y los pesos se renormalizan", () => {
  const r = identityScore(base());
  // Solo existen constancia (50), equilibrio (media de 100 y 0 = 50) y reflexión (0 de 4 días).
  assert.equal(valor(r, "constancia"), 50);
  assert.equal(valor(r, "equilibrio"), 50);
  assert.equal(valor(r, "reflexion"), 0);
  assert.equal(valor(r, "votos"), null);
  assert.equal(valor(r, "metas"), null);
  assert.equal(valor(r, "rutinas"), null);
  // (25·50 + 15·50 + 10·0) / 50 = 40
  assert.equal(r.score, 40);
});

test("votos: media por rasgo activo con hábitos vinculados; los inactivos no votan", () => {
  const r = identityScore(
    base({
      traits: [
        { id: "atleta", active: true },
        { id: "ahorrador", active: true },
        { id: "viejo", active: false },
        { id: "sin-habitos", active: true }
      ],
      votes: [
        { habitId: "a", traitId: "atleta" },
        { habitId: "b", traitId: "ahorrador" },
        { habitId: "a", traitId: "viejo" }
      ]
    })
  );
  assert.equal(valor(r, "votos"), 50); // atleta 100, ahorrador 0
});

test("metas: 100 menos lo que vas por detrás del ritmo; sin horizonte no se juzgan", () => {
  const r = identityScore(
    base({
      goals: [
        { progressPct: 30, startISO: "2026-09-05", horizonISO: "2026-09-25" }, // esperado 50 → 80
        { progressPct: 90, startISO: "2026-09-05", horizonISO: "2026-09-25" }, // adelantada → 100
        { progressPct: 0, startISO: "2026-09-01", horizonISO: null }
      ]
    })
  );
  assert.equal(valor(r, "metas"), 90);
});

test("rutinas y reflexión: la ventana de reflexión no pasa de los días desde el primer hábito", () => {
  const r = identityScore(base({ routineAdherence: [80, 40], reflectionDays: ["2026-09-13", "2026-09-14", "2026-09-01"] }));
  assert.equal(valor(r, "rutinas"), 60);
  assert.equal(valor(r, "reflexion"), 50); // 2 de 4 días (12 al 15); el 1 queda fuera
});

test("todos los componentes: media ponderada y desglose completo", () => {
  const r = identityScore(
    base({
      traits: [{ id: "atleta", active: true }],
      votes: [{ habitId: "a", traitId: "atleta" }],
      goals: [{ progressPct: 50, startISO: "2026-09-05", horizonISO: "2026-09-25" }],
      routineAdherence: [100],
      reflectionDays: ["2026-09-12", "2026-09-13", "2026-09-14", HOY]
    })
  );
  // votos 100·25 + constancia 50·25 + equilibrio 50·15 + metas 100·15 + rutinas 100·10 + reflexión 100·10 = 8000 / 100
  assert.equal(r.score, 80);
  assert.deepEqual(r.components.map((c) => c.key), ["votos", "constancia", "equilibrio", "metas", "rutinas", "reflexion"]);
  assert.equal(r.components.reduce((s, c) => s + c.weight, 0), 100);
});

test("resolveHabitAreas: manda el área del primer rasgo activo; si no, la categoría", () => {
  const areas = resolveHabitAreas(
    [
      { id: "a", category: "Personal" },
      { id: "b", category: "Trabajo" },
      { id: "c", category: "Salud" }
    ],
    [
      { id: "t1", area: "Finanzas", active: true, position: 1 },
      { id: "t0", area: "Espiritual", active: true, position: 0 },
      { id: "tx", area: "Relaciones", active: false, position: 0 }
    ],
    [
      { habitId: "a", traitId: "t1" },
      { habitId: "a", traitId: "t0" },
      { habitId: "c", traitId: "tx" }
    ]
  );
  assert.deepEqual(areas, { a: "Espiritual", b: "Carrera", c: "Salud" });
});
