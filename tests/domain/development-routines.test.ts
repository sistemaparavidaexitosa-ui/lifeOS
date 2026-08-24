// tests/domain/development-routines.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routineDueToday,
  routineProgress,
  routineFitsBlock,
  routineAdherence,
  nextCompletedSteps,
  habitLogEffect
} from "../../src/lib/domain/development/routines.ts";
import { habitStreak } from "../../src/lib/domain/habits.ts";
import type { HabitLogLike } from "../../src/lib/domain/types.ts";

// 2026-08-22 es sábado; 2026-08-24 es lunes; 2026-08-26 es miércoles.

test("routineDueToday: Diario toca todos los días", () => {
  assert.strictEqual(routineDueToday("Diario", "2026-08-22"), true);
  assert.strictEqual(routineDueToday("Diario", "2026-08-24"), true);
});

test("routineDueToday: Entre semana excluye sábado y domingo", () => {
  assert.strictEqual(routineDueToday("Entre semana", "2026-08-22"), false); // sábado
  assert.strictEqual(routineDueToday("Entre semana", "2026-08-26"), true);  // miércoles
});

test("routineDueToday: Fin de semana es solo sábado y domingo", () => {
  assert.strictEqual(routineDueToday("Fin de semana", "2026-08-22"), true);
  assert.strictEqual(routineDueToday("Fin de semana", "2026-08-26"), false);
});

test("routineDueToday: Semanal se ancla al lunes", () => {
  assert.strictEqual(routineDueToday("Semanal", "2026-08-24"), true);
  assert.strictEqual(routineDueToday("Semanal", "2026-08-26"), false);
});

test("routineProgress: cuenta pasos hechos y minutos que faltan", () => {
  const steps = [
    { id: "s1", durationMin: 10 },
    { id: "s2", durationMin: 15 },
    { id: "s3", durationMin: 5 }
  ];
  assert.deepStrictEqual(routineProgress(["s1"], steps), { done: 1, total: 3, pct: 33, remainingMin: 20 });
});

test("routineProgress: una rutina sin pasos va en 0, no en NaN", () => {
  assert.deepStrictEqual(routineProgress([], []), { done: 0, total: 0, pct: 0, remainingMin: 0 });
});

test("routineProgress: ignora ids de pasos que ya no existen", () => {
  const steps = [{ id: "s1", durationMin: 10 }];
  assert.strictEqual(routineProgress(["s1", "s-borrado"], steps).done, 1);
});

test("routineFitsBlock: 30 min de pasos no caben en un bloque de 20", () => {
  const steps = [{ id: "s1", durationMin: 20 }, { id: "s2", durationMin: 10 }];
  assert.strictEqual(routineFitsBlock(steps, { start: "06:00", end: "06:20" }), false);
  assert.strictEqual(routineFitsBlock(steps, { start: "06:00", end: "07:00" }), true);
});

test("routineFitsBlock: sin bloque anclado no hay conflicto posible", () => {
  assert.strictEqual(routineFitsBlock([{ id: "s1", durationMin: 999 }], null), true);
});

test("routineAdherence: 3 de 5 días entre semana cumplidos = 60%", () => {
  // 2026-08-24 (lun) a 2026-08-28 (vie): 5 días que tocan
  const done = ["2026-08-24", "2026-08-25", "2026-08-27"];
  assert.strictEqual(routineAdherence(done, "Entre semana", "2026-08-24", "2026-08-28"), 60);
});

test("routineAdherence: un rango donde la rutina nunca toca devuelve 0, no divide entre cero", () => {
  assert.strictEqual(routineAdherence([], "Fin de semana", "2026-08-24", "2026-08-26"), 0);
});

test("nextCompletedSteps: alterna sin duplicar", () => {
  assert.deepStrictEqual(nextCompletedSteps([], "s1"), ["s1"]);
  assert.deepStrictEqual(nextCompletedSteps(["s1"], "s1"), []);
  assert.deepStrictEqual(nextCompletedSteps(["s1"], "s2"), ["s1", "s2"]);
});

test("habitLogEffect: marcar un paso ligado a un hábito no marcado hoy lo inserta", () => {
  assert.strictEqual(habitLogEffect("h1", true, false), "insert");
});

test("habitLogEffect: si el hábito ya se marcó hoy no se duplica la fila", () => {
  assert.strictEqual(habitLogEffect("h1", true, true), "noop");
});

test("habitLogEffect: desmarcar el paso NO desmarca el hábito", () => {
  assert.strictEqual(habitLogEffect("h1", false, true), "noop");
});

test("habitLogEffect: un paso sin hábito ligado no toca habit_logs", () => {
  assert.strictEqual(habitLogEffect(null, true, false), "noop");
});

// El puente rutina → hábito, verificado como pide §9 del spec: la racha tiene
// que dar lo mismo se haya cerrado el hábito desde la rutina o desde
// /development/habits. Se simula el almacén de `habit_logs` con la misma regla
// que aplica la Server Action: insertar solo cuando `habitLogEffect` lo dice, y
// nunca dos veces la misma fecha (índice único `(habit_id, log_date)`).
function applyToggle(logs: HabitLogLike[], habitId: string | null, willBeDone: boolean, today: string): HabitLogLike[] {
  const already = logs.some((l) => l.habitId === habitId && l.date === today);
  if (habitLogEffect(habitId, willBeDone, already) !== "insert" || habitId === null) return logs;
  return [...logs, { habitId, date: today }];
}

test("puente rutina → hábito: marcar el paso deja exactamente una fila en habit_logs", () => {
  const today = "2026-08-26";
  let logs: HabitLogLike[] = [];
  logs = applyToggle(logs, "h1", true, today);
  logs = applyToggle(logs, "h1", false, today); // desmarcar el paso
  logs = applyToggle(logs, "h1", true, today); // y volver a marcarlo
  assert.strictEqual(logs.filter((l) => l.habitId === "h1" && l.date === today).length, 1);
});

test("puente rutina → hábito: la racha es la misma que marcando desde /development/habits", () => {
  const ayer = "2026-08-25";
  const hoy = "2026-08-26";
  const previos: HabitLogLike[] = [{ habitId: "h1", date: ayer }];

  // Camino A: el hábito se cierra ejecutando el paso de la rutina.
  const porRutina = applyToggle(previos, "h1", true, hoy);
  // Camino B: el hábito se marca directo en /development/habits (misma fila).
  const porHabitos: HabitLogLike[] = [...previos, { habitId: "h1", date: hoy }];

  assert.strictEqual(habitStreak("h1", porRutina, hoy), habitStreak("h1", porHabitos, hoy));
  assert.strictEqual(habitStreak("h1", porRutina, hoy), 2);
});
