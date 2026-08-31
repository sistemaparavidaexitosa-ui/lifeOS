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

test("activityLabel: traduce lo que ahora deja rastro y antes no lo dejaba", () => {
  assert.strictEqual(activityLabel("task.create"), "Tarea");
  assert.strictEqual(activityLabel("task.status"), "Estado");
  assert.strictEqual(activityLabel("task.delete"), "Tarea borrada");
  assert.strictEqual(activityLabel("project.create"), "Proyecto");
  assert.strictEqual(activityLabel("project.update"), "Proyecto");
  assert.strictEqual(activityLabel("project.delete"), "Proyecto borrado");
  assert.strictEqual(activityLabel("group.create"), "Grupo");
  assert.strictEqual(activityLabel("group.rename"), "Grupo");
  assert.strictEqual(activityLabel("group.delete"), "Grupo borrado");
  assert.strictEqual(activityLabel("template.apply"), "Plantilla");
});

test("activityLabel: el mensaje del hilo de proyecto se lee como comentario", () => {
  // Es un tipo aparte solo para que el propio hilo pueda excluirlo al pintarse
  // (el mensaje ya está en su tarjeta). En el feed no hay tal duplicado.
  assert.strictEqual(activityLabel("comment.project"), "Comentario");
});

test("activityLabel: `move` se traduce igual que `project.move`", () => {
  // La Server Action escribe `move`; el mapa solo conocía `project.move`, así
  // que el feed llevaba enseñando «move» en crudo desde 0003.
  assert.strictEqual(activityLabel("move"), "Movido");
  assert.strictEqual(activityLabel("project.move"), "Movido");
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
