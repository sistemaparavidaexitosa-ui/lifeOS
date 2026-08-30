// tests/domain/execution-activity.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityLabel, groupByDay, type ActivityEntry } from "../../src/lib/domain/execution/activity.ts";

const entrada = (id: string, at: string, over: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id,
  type: "comment",
  text: `Evento ${id}`,
  actor: "ana@test.local",
  at,
  projectId: null,
  ...over
});

test("activityLabel: traduce los tipos conocidos", () => {
  assert.strictEqual(activityLabel("comment"), "Comentario");
  assert.strictEqual(activityLabel("task.assign"), "Responsables");
});

test("activityLabel: un tipo desconocido se devuelve tal cual, no como 'Otro'", () => {
  // `workspace_activity.type` es texto libre en el esquema: una acción futura
  // puede escribir algo que este mapa no conozca, y esconderlo borraría la
  // única pista de qué pasó.
  assert.strictEqual(activityLabel("task.inventado"), "task.inventado");
});

test("groupByDay: sin entradas devuelve una lista vacía", () => {
  assert.deepStrictEqual(groupByDay([]), []);
});

test("groupByDay: agrupa las del mismo día en un solo bloque", () => {
  const days = groupByDay([
    entrada("a", "2026-08-20T15:00:00Z"),
    entrada("b", "2026-08-20T17:00:00Z"),
    entrada("c", "2026-08-19T10:00:00Z")
  ]);
  assert.strictEqual(days.length, 2);
  assert.strictEqual(days[0]?.entries.length, 2);
  assert.strictEqual(days[1]?.entries.length, 1);
});

test("groupByDay: los días salen del más reciente al más antiguo", () => {
  const days = groupByDay([entrada("viejo", "2026-08-10T10:00:00Z"), entrada("nuevo", "2026-08-20T10:00:00Z")]);
  assert.ok((days[0]?.dateISO ?? "") > (days[1]?.dateISO ?? ""));
});

test("groupByDay: dentro de un día, lo más reciente va primero", () => {
  const days = groupByDay([entrada("temprano", "2026-08-20T09:00:00Z"), entrada("tarde", "2026-08-20T18:00:00Z")]);
  assert.deepStrictEqual(days[0]?.entries.map((e) => e.id), ["tarde", "temprano"]);
});

test("groupByDay: corta por el día LOCAL, no por el prefijo del ISO", () => {
  // 01:00 UTC del día 21 es todavía el día 20 en México. Cortando por texto
  // caería en un día distinto — el mismo error que arregló la migración 0016.
  const mismoDiaLocal = new Date("2026-08-20T23:30:00");
  const siguienteHoraLocal = new Date("2026-08-20T23:59:00");
  const days = groupByDay([
    entrada("a", mismoDiaLocal.toISOString()),
    entrada("b", siguienteHoraLocal.toISOString())
  ]);
  assert.strictEqual(days.length, 1, "las dos son del mismo día local");
});

test("groupByDay: una fecha inválida se ignora en vez de romper el feed", () => {
  const days = groupByDay([entrada("mala", "no-es-una-fecha"), entrada("buena", "2026-08-20T10:00:00Z")]);
  assert.strictEqual(days.length, 1);
  assert.strictEqual(days[0]?.entries[0]?.id, "buena");
});
