// tests/domain/execution-reminders.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  presetDate,
  dueReminders,
  overdueDays,
  PRESET_DAYS,
  type ReminderLike
} from "../../src/lib/domain/execution/reminders.ts";

const HOY = "2026-08-23";

const rec = (id: string, on: string, over: Partial<ReminderLike> = {}): ReminderLike => ({
  id,
  subjectType: "task",
  subjectId: "t1",
  text: "",
  remindOnISO: on,
  done: false,
  ...over
});

test("presetDate: mañana es un día después, en la zona del perfil", () => {
  assert.strictEqual(presetDate("manana", HOY), "2026-08-24");
});

test("presetDate: la próxima semana son 7 días, no 'el lunes que viene'", () => {
  // Un lunes fijo amontonaría en un día todo lo aplazado durante la semana.
  assert.strictEqual(presetDate("proxima-semana", HOY), "2026-08-30");
  assert.strictEqual(PRESET_DAYS["proxima-semana"], 7);
});

test("presetDate: cruza el fin de mes sin romperse", () => {
  assert.strictEqual(presetDate("en-3-dias", "2026-08-30"), "2026-09-02");
});

test("dueReminders: incluye el de hoy", () => {
  assert.deepStrictEqual(dueReminders([rec("a", HOY)], HOY).map((r) => r.id), ["a"]);
});

test("dueReminders: incluye los VENCIDOS — no desaparecen por no haber abierto la app", () => {
  const out = dueReminders([rec("viejo", "2026-08-01"), rec("hoy", HOY)], HOY);
  assert.deepStrictEqual(out.map((r) => r.id), ["viejo", "hoy"], "y el más viejo primero");
});

test("dueReminders: excluye los del futuro", () => {
  assert.deepStrictEqual(dueReminders([rec("a", "2026-09-01")], HOY), []);
});

test("dueReminders: excluye los ya hechos aunque estén vencidos", () => {
  assert.deepStrictEqual(dueReminders([rec("a", "2026-08-01", { done: true })], HOY), []);
});

test("dueReminders: con la misma fecha el orden es estable entre recargas", () => {
  const a = dueReminders([rec("b", HOY), rec("a", HOY)], HOY).map((r) => r.id);
  const b = dueReminders([rec("a", HOY), rec("b", HOY)], HOY).map((r) => r.id);
  assert.deepStrictEqual(a, b);
});

test("overdueDays: cero para el de hoy", () => {
  assert.strictEqual(overdueDays(rec("a", HOY), HOY), 0);
});

test("overdueDays: cuenta los días de espera", () => {
  assert.strictEqual(overdueDays(rec("a", "2026-08-20"), HOY), 3);
});

test("overdueDays: nunca es negativo", () => {
  assert.strictEqual(overdueDays(rec("a", "2026-09-01"), HOY), 0);
});
