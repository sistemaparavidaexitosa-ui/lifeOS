import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizePlan,
  fullSelection,
  planSummary,
  selectionToTemplate,
  groupKey,
  taskKey,
  subtaskKey,
  templateFromPayload,
  PLAN_LIMITS
} from "../../src/lib/domain/execution/ai-plan.ts";
import { GROUP_COLORS } from "../../src/lib/domain/execution/project-templates.ts";

/** Un plan mínimo válido, para no repetir el andamiaje en cada test. */
function raw(groups: unknown[]) {
  return { name: "Plan", summary: "Resumen", groups };
}

// ===========================================================================
// sanitizePlan — los topes
// ===========================================================================

test("sanitizePlan: recorta a 6 grupos, no rechaza el plan entero", () => {
  const nueve = Array.from({ length: 9 }, (_, i) => ({ name: `G${i}`, tasks: [{ title: "t" }] }));
  const plan = sanitizePlan(raw(nueve));
  assert.strictEqual(plan.groups.length, PLAN_LIMITS.groups);
  assert.strictEqual(plan.groups[0].name, "G0", "recorta por el final, conserva el principio");
});

test("sanitizePlan: recorta a 6 tareas por grupo", () => {
  const tareas = Array.from({ length: 10 }, (_, i) => ({ title: `T${i}` }));
  const plan = sanitizePlan(raw([{ name: "G", tasks: tareas }]));
  assert.strictEqual(plan.groups[0].tasks.length, PLAN_LIMITS.tasksPerGroup);
});

test("sanitizePlan: recorta a 4 subtareas por tarea", () => {
  const subs = Array.from({ length: 8 }, (_, i) => `S${i}`);
  const plan = sanitizePlan(raw([{ name: "G", tasks: [{ title: "T", subtasks: subs }] }]));
  assert.strictEqual(plan.groups[0].tasks[0].subtasks.length, PLAN_LIMITS.subtasksPerTask);
});

test("sanitizePlan: respeta el tope global de tareas raíz", () => {
  // 6 grupos x 6 tareas = 36 posibles, pero el tope global es 30.
  const grupos = Array.from({ length: 6 }, (_, g) => ({
    name: `G${g}`,
    tasks: Array.from({ length: 6 }, (_, t) => ({ title: `G${g}T${t}` }))
  }));
  const plan = sanitizePlan(raw(grupos));
  const total = plan.groups.reduce((n, g) => n + g.tasks.length, 0);
  assert.strictEqual(total, PLAN_LIMITS.totalTasks);
});

// ===========================================================================
// sanitizePlan — la poda
// ===========================================================================

test("sanitizePlan: descarta títulos vacíos o solo espacios", () => {
  const plan = sanitizePlan(raw([{ name: "G", tasks: [{ title: "  " }, { title: "" }, { title: "Buena" }, { title: 42 }] }]));
  assert.deepStrictEqual(
    plan.groups[0].tasks.map((t) => t.title),
    ["Buena"]
  );
});

test("sanitizePlan: descarta el grupo que se queda sin tareas", () => {
  const plan = sanitizePlan(raw([{ name: "Vacío", tasks: [{ title: "   " }] }, { name: "Con", tasks: [{ title: "T" }] }]));
  assert.deepStrictEqual(
    plan.groups.map((g) => g.name),
    ["Con"]
  );
});

test("sanitizePlan: recorta los títulos largos al límite de la columna", () => {
  const largo = "x".repeat(500);
  // La subtarea usa OTRA letra a propósito: repetir el título del padre la
  // descarta, que es otra regla y tiene su propio test.
  const plan = sanitizePlan(raw([{ name: largo, tasks: [{ title: largo, subtasks: ["y".repeat(500)] }] }]));
  assert.strictEqual(plan.groups[0].name.length, PLAN_LIMITS.titleLength);
  assert.strictEqual(plan.groups[0].tasks[0].title.length, PLAN_LIMITS.titleLength);
  assert.strictEqual(plan.groups[0].tasks[0].subtasks[0].length, PLAN_LIMITS.titleLength);
});

test("sanitizePlan: deduplica títulos repetidos dentro del mismo grupo, sin distinguir mayúsculas", () => {
  const plan = sanitizePlan(raw([{ name: "G", tasks: [{ title: "Hacer algo" }, { title: "  hacer   algo " }, { title: "Otra" }] }]));
  assert.deepStrictEqual(
    plan.groups[0].tasks.map((t) => t.title),
    ["Hacer algo", "Otra"]
  );
});

test("sanitizePlan: el mismo título en grupos distintos NO se deduplica", () => {
  const plan = sanitizePlan(raw([{ name: "A", tasks: [{ title: "Revisar" }] }, { name: "B", tasks: [{ title: "Revisar" }] }]));
  assert.strictEqual(plan.groups.length, 2, "«Revisar» en dos fases distintas es legítimo");
});

test("sanitizePlan: un plan sin nada aprovechable devuelve cero grupos, no revienta", () => {
  assert.strictEqual(sanitizePlan(raw([])).groups.length, 0);
  assert.strictEqual(sanitizePlan({}).groups.length, 0);
  assert.strictEqual(sanitizePlan({ groups: "no soy un array" }).groups.length, 0);
});

// ===========================================================================
// sanitizePlan — color, prioridad y fechas
// ===========================================================================

test("sanitizePlan: el color lo pone el sistema, ciclando la paleta; el del modelo se ignora", () => {
  const siete = Array.from({ length: 7 }, (_, i) => ({ name: `G${i}`, color: "#ff0000", tasks: [{ title: "t" }] }));
  const plan = sanitizePlan(raw(siete));
  for (const g of plan.groups) {
    assert.ok(GROUP_COLORS.includes(g.color as (typeof GROUP_COLORS)[number]), `${g.color} debe ser un token del design system`);
  }
  assert.strictEqual(plan.groups[0].color, GROUP_COLORS[0]);
  assert.strictEqual(plan.groups[1].color, GROUP_COLORS[1]);
});

test("sanitizePlan: una prioridad que no existe cae a Medium", () => {
  const plan = sanitizePlan(
    raw([{ name: "G", tasks: [{ title: "a", priority: "Urgente" }, { title: "b", priority: "High" }, { title: "c" }] }])
  );
  assert.deepStrictEqual(
    plan.groups[0].tasks.map((t) => t.priority),
    ["Medium", "High", "Medium"]
  );
});

test("sanitizePlan: NINGUNA fecha del modelo sobrevive (protege D-044)", () => {
  const plan = sanitizePlan(
    raw([{ name: "G", due: "2026-12-01", tasks: [{ title: "T", due: "2026-10-01", start: "2026-09-01" }] }])
  );
  const serializado = JSON.stringify(plan);
  assert.ok(!serializado.includes("2026-10-01"), "la fecha de la tarea no puede llegar al tablero");
  assert.ok(!serializado.includes("2026-12-01"), "la fecha del grupo tampoco");
  assert.ok(!("due" in plan.groups[0].tasks[0]), "la tarea saneada no tiene campo due");
});

// ===========================================================================
// Selección: qué se inserta y qué no
// ===========================================================================

const DRAFT = sanitizePlan(
  raw([
    { name: "Fase 1", tasks: [{ title: "A", subtasks: ["A1", "A2"] }, { title: "B" }] },
    { name: "Fase 2", tasks: [{ title: "C" }] }
  ])
);

test("fullSelection: marca todo lo que hay", () => {
  const sel = fullSelection(DRAFT);
  assert.ok(sel.has(groupKey(0)) && sel.has(groupKey(1)));
  assert.ok(sel.has(taskKey(0, 0)) && sel.has(taskKey(0, 1)) && sel.has(taskKey(1, 0)));
  assert.ok(sel.has(subtaskKey(0, 0, 0)) && sel.has(subtaskKey(0, 0, 1)));
});

test("selectionToTemplate: todo marcado reproduce el borrador entero", () => {
  const tpl = selectionToTemplate(DRAFT, fullSelection(DRAFT));
  assert.ok(tpl);
  assert.deepStrictEqual(tpl.groups.map((g) => g.name), ["Fase 1", "Fase 2"]);
  assert.deepStrictEqual(tpl.groups[0].tasks[0].subtasks, ["A1", "A2"]);
});

test("selectionToTemplate: un grupo desmarcado se lleva sus tareas", () => {
  const sel = new Set(fullSelection(DRAFT));
  sel.delete(groupKey(0));
  const tpl = selectionToTemplate(DRAFT, sel);
  assert.deepStrictEqual(tpl?.groups.map((g) => g.name), ["Fase 2"]);
});

test("selectionToTemplate: una tarea desmarcada se lleva sus subtareas", () => {
  const sel = new Set(fullSelection(DRAFT));
  sel.delete(taskKey(0, 0));
  const tpl = selectionToTemplate(DRAFT, sel);
  assert.deepStrictEqual(tpl?.groups[0].tasks.map((t) => t.title), ["B"]);
});

test("selectionToTemplate: una subtarea desmarcada no arrastra a su padre", () => {
  const sel = new Set(fullSelection(DRAFT));
  sel.delete(subtaskKey(0, 0, 0));
  const tpl = selectionToTemplate(DRAFT, sel);
  assert.deepStrictEqual(tpl?.groups[0].tasks[0].subtasks, ["A2"]);
});

test("selectionToTemplate: un grupo sin ninguna tarea marcada se descarta entero", () => {
  const sel = new Set(fullSelection(DRAFT));
  sel.delete(taskKey(1, 0));
  const tpl = selectionToTemplate(DRAFT, sel);
  assert.deepStrictEqual(tpl?.groups.map((g) => g.name), ["Fase 1"], "un grupo vacío en el tablero es ruido");
});

test("selectionToTemplate: sin nada marcado devuelve null, no una plantilla vacía", () => {
  assert.strictEqual(selectionToTemplate(DRAFT, new Set()), null);
});

test("planSummary: cuenta exactamente lo que selectionToTemplate va a insertar", () => {
  const sel = new Set(fullSelection(DRAFT));
  sel.delete(taskKey(0, 1));
  const resumen = planSummary(DRAFT, sel);
  const tpl = selectionToTemplate(DRAFT, sel);
  const tareas = tpl!.groups.reduce((n, g) => n + g.tasks.length, 0);
  const subtareas = tpl!.groups.reduce((n, g) => n + g.tasks.reduce((m, t) => m + (t.subtasks?.length ?? 0), 0), 0);
  assert.strictEqual(resumen.groups, tpl!.groups.length);
  assert.strictEqual(resumen.tasks, tareas);
  assert.strictEqual(resumen.subtasks, subtareas);
});

test("sanitizePlan: una subtarea que repite el título de su padre se descarta", () => {
  const plan = sanitizePlan(raw([{ name: "G", tasks: [{ title: "Publicar", subtasks: ["publicar", "Avisar"] }] }]));
  assert.deepStrictEqual(plan.groups[0].tasks[0].subtasks, ["Avisar"], "no descompone nada");
});

// ===========================================================================
// El plan que viaja en el formulario de "Nuevo proyecto"
// ===========================================================================

test("templateFromPayload: reconstruye la plantilla desde el payload del formulario", () => {
  const sel = new Set(fullSelection(DRAFT));
  sel.delete(taskKey(0, 1));
  const tpl = templateFromPayload({ draft: DRAFT, selection: [...sel] });
  assert.deepStrictEqual(tpl?.groups.map((g) => g.name), ["Fase 1", "Fase 2"]);
  assert.deepStrictEqual(tpl?.groups[0].tasks.map((t) => t.title), ["A"]);
});

test("templateFromPayload: sanea de nuevo lo que llega del navegador", () => {
  // Un borrador manipulado en el cliente para colar 9 grupos y una fecha.
  const manipulado = {
    name: "Colado",
    groups: Array.from({ length: 9 }, (_, i) => ({ name: `G${i}`, tasks: [{ title: "T", due: "2026-01-01" }] }))
  };
  const selection = Array.from({ length: 9 }, (_, i) => [groupKey(i), taskKey(i, 0)]).flat();
  const tpl = templateFromPayload({ draft: manipulado, selection });
  assert.strictEqual(tpl?.groups.length, PLAN_LIMITS.groups, "el tope se aplica también en el servidor");
  assert.ok(!JSON.stringify(tpl).includes("2026-01-01"), "la fecha colada tampoco pasa");
});

test("templateFromPayload: basura devuelve null, no revienta", () => {
  assert.strictEqual(templateFromPayload({}), null);
  assert.strictEqual(templateFromPayload({ draft: DRAFT, selection: "no soy un array" }), null);
  assert.strictEqual(templateFromPayload(null), null);
});
