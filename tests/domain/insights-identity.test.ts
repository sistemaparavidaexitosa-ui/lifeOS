import { test } from "node:test";
import assert from "node:assert/strict";
import { identityFacts, type IdentitySnapshot } from "../../src/lib/domain/insights/facts/identity.ts";
import type { HabitLogEntry } from "../../src/lib/domain/development/habit-analytics.ts";

const HOY = "2026-09-15";
const hecho = (date: string): HabitLogEntry => ({ date, status: "completed", pct: 100 });
const diasSeguidos = (n: number) => Array.from({ length: n }, (_, i) => hecho(`2026-09-${String(14 - i).padStart(2, "0")}`));

function base(extra: Partial<IdentitySnapshot> = {}): IdentitySnapshot {
  return {
    today: HOY,
    habits: [
      { id: "leer", name: "Leer" },
      { id: "correr", name: "Correr" }
    ],
    series: [
      { habitId: "leer", frequency: "Diario", createdOn: "2026-08-01", logs: diasSeguidos(9) },
      { habitId: "correr", frequency: "Diario", createdOn: "2026-08-01", logs: [hecho("2026-09-14")] }
    ],
    traits: [
      { id: "lector", name: "Lector", active: true },
      { id: "atleta", name: "Atleta", active: true }
    ],
    votes: [
      { habitId: "leer", traitId: "lector" },
      { habitId: "correr", traitId: "atleta" }
    ],
    score: 62,
    scoreWeekAgo: 55,
    goalsAchieved: [
      { id: "g1", title: "Leer 12 libros", achievedOn: "2026-09-10" },
      { id: "g0", title: "Vieja", achievedOn: "2026-08-01" }
    ],
    solidStreak: 4,
    ...extra
  };
}

test("identityFacts: racha en récord, rasgo débil, score al alza, meta reciente y días sólidos", () => {
  const ids = identityFacts(base()).map((f) => f.id);
  assert.ok(ids.includes("identity.streak.leer"));
  assert.ok(!ids.includes("identity.streak.correr"));
  assert.ok(ids.includes("identity.trait-weak.atleta"));
  assert.ok(ids.includes("identity.score-up"));
  assert.ok(ids.includes("identity.goal-achieved.g1"));
  assert.ok(!ids.includes("identity.goal-achieved.g0"));
  assert.ok(ids.includes("identity.solid-days"));
  const racha = identityFacts(base()).find((f) => f.id === "identity.streak.leer")!;
  assert.match(racha.label, /mejor racha: 9 días/);
});

test("identityFacts: sin cambios notables no inventa hechos de score ni de días sólidos", () => {
  const ids = identityFacts(base({ score: 56, scoreWeekAgo: 55, solidStreak: 1, goalsAchieved: [] })).map((f) => f.id);
  assert.ok(!ids.some((id) => id.startsWith("identity.score")));
  assert.ok(!ids.includes("identity.solid-days"));
});
