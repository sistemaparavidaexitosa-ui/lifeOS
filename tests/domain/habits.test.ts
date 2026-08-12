import { test } from "node:test";
import assert from "node:assert/strict";
import { habitStreak, habitDoneToday } from "../../src/lib/domain/habits.ts";

test("habitStreak: 0 si nunca se ha marcado cumplido", () => {
  assert.strictEqual(habitStreak("h1", [], "2026-08-12"), 0);
});

test("habitStreak: cuenta días consecutivos terminando hoy", () => {
  const logs = [
    { habitId: "h1", date: "2026-08-12" },
    { habitId: "h1", date: "2026-08-11" },
    { habitId: "h1", date: "2026-08-10" }
  ];
  assert.strictEqual(habitStreak("h1", logs, "2026-08-12"), 3);
});

test("habitStreak: se corta si hay un día faltante", () => {
  const logs = [
    { habitId: "h1", date: "2026-08-12" },
    { habitId: "h1", date: "2026-08-10" } // falta el 11
  ];
  assert.strictEqual(habitStreak("h1", logs, "2026-08-12"), 1);
});

test("habitStreak: 0 si hoy no se ha marcado, aunque haya racha previa", () => {
  const logs = [
    { habitId: "h1", date: "2026-08-11" },
    { habitId: "h1", date: "2026-08-10" }
  ];
  assert.strictEqual(habitStreak("h1", logs, "2026-08-12"), 0);
});

test("habitDoneToday: detecta correctamente por habitId y fecha", () => {
  const logs = [{ habitId: "h1", date: "2026-08-12" }];
  assert.strictEqual(habitDoneToday("h1", logs, "2026-08-12"), true);
  assert.strictEqual(habitDoneToday("h2", logs, "2026-08-12"), false);
});
