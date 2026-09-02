// tests/domain/development-routines.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routineDueToday,
  routineProgress,
  routineFitsBlock,
  routineAdherence,
  routineRunComplete,
  routineRunNeedsWrite,
  toggleHabitEffect
} from "../../src/lib/domain/development/routines.ts";

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

test("routineProgress: cuenta hábitos hechos y minutos que faltan", () => {
  const habits = [
    { id: "h1", durationMin: 10 },
    { id: "h2", durationMin: 15 },
    { id: "h3", durationMin: 5 }
  ];
  assert.deepStrictEqual(routineProgress(["h1"], habits), { done: 1, total: 3, pct: 33, remainingMin: 20 });
});

test("routineProgress: una rutina sin hábitos va en 0, no en NaN", () => {
  assert.deepStrictEqual(routineProgress([], []), { done: 0, total: 0, pct: 0, remainingMin: 0 });
});

test("routineProgress: ignora registros de hábitos que ya no están en la rutina", () => {
  const habits = [{ id: "h1", durationMin: 10 }];
  assert.strictEqual(routineProgress(["h1", "h-de-otra-rutina"], habits).done, 1);
});

test("routineFitsBlock: 30 min de hábitos no caben en un bloque de 20", () => {
  const habits = [{ id: "h1", durationMin: 20 }, { id: "h2", durationMin: 10 }];
  assert.strictEqual(routineFitsBlock(habits, { start: "06:00", end: "06:20" }), false);
  assert.strictEqual(routineFitsBlock(habits, { start: "06:00", end: "07:00" }), true);
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

test("routineRunComplete: se cierra solo cuando TODOS los hábitos tienen registro hoy", () => {
  assert.strictEqual(routineRunComplete(["h1", "h2"], ["h1"]), false);
  assert.strictEqual(routineRunComplete(["h1", "h2"], ["h1", "h2"]), true);
});

test("routineRunComplete: una rutina sin hábitos NO se da por hecha", () => {
  // Sin esto, una rutina recién creada aparecería cumplida sin haber hecho
  // nada, y contaminaría la adherencia a 30 días con días regalados.
  assert.strictEqual(routineRunComplete([], []), false);
});

test("routineRunComplete: registros de hábitos ajenos no cierran la rutina", () => {
  assert.strictEqual(routineRunComplete(["h1", "h2"], ["h1", "h9"]), false);
});

test("routineRunNeedsWrite: si hoy ya hay ejecución, se corrige siempre", () => {
  // Los dos casos que dejaban `completed_at` mintiendo cuando solo lo
  // recalculaba el toggle: añadir un hábito a una rutina ya cerrada hoy, y
  // borrar el último que quedaba sin marcar.
  assert.strictEqual(routineRunNeedsWrite(true, false), true);
  assert.strictEqual(routineRunNeedsWrite(true, true), true);
});

test("routineRunNeedsWrite: sin ejecución hoy, solo se escribe si la rutina queda cerrada", () => {
  // Editar no es ejecutar: crear la fila por un cambio de nombre le daría a la
  // rutina un `started_at` que nadie provocó, y el motor dejaría de avisar de
  // que lleva días sin correrse.
  assert.strictEqual(routineRunNeedsWrite(false, false), false);
  assert.strictEqual(routineRunNeedsWrite(false, true), true);
});

test("toggleHabitEffect: marcar inserta, desmarcar borra", () => {
  // La fusión cambia una conducta deliberada del modelo viejo: cuando el paso
  // y el hábito eran dos registros, desmarcar el paso NO borraba la racha.
  // Ahora son el mismo registro, así que desmarcar es desmarcar.
  assert.strictEqual(toggleHabitEffect(false), "insert");
  assert.strictEqual(toggleHabitEffect(true), "delete");
});
