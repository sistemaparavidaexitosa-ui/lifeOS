import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  computeStats,
  diffDays,
  filterTaskTree,
  isOverdue,
  nextPosition,
  reorderIds,
  sortTasks,
  timelineBar,
  timelineRange,
  todayISO,
  type BoardTaskLike
} from "../../src/lib/domain/board.ts";

const TODAY = "2026-03-10";

function task(over: Partial<BoardTaskLike> & { id: string }): BoardTaskLike {
  return {
    title: over.id,
    status: "Pending",
    priority: "Medium",
    urgent: false,
    due: null,
    startDate: null,
    parentTaskId: null,
    groupId: "g1",
    position: 0,
    ...over
  };
}

// --- fechas ---------------------------------------------------------------

test("todayISO usa la fecha local, no UTC", () => {
  assert.strictEqual(todayISO(new Date(2026, 2, 10, 23, 30)), "2026-03-10");
});

test("diffDays cuenta días calendario", () => {
  assert.strictEqual(diffDays("2026-03-10", "2026-03-12"), 2);
  assert.strictEqual(diffDays("2026-03-12", "2026-03-10"), -2);
});

test("isOverdue: solo tareas abiertas con due pasado", () => {
  assert.strictEqual(isOverdue({ due: "2026-03-09", status: "Pending" }, TODAY), true);
  assert.strictEqual(isOverdue({ due: "2026-03-10", status: "Pending" }, TODAY), false);
  assert.strictEqual(isOverdue({ due: "2026-03-09", status: "Completed" }, TODAY), false);
  assert.strictEqual(isOverdue({ due: "2026-03-09", status: "Cancelled" }, TODAY), false);
  assert.strictEqual(isOverdue({ due: null, status: "Pending" }, TODAY), false);
});

// --- filtros --------------------------------------------------------------

test("sin filtros activos devuelve la lista intacta (misma referencia)", () => {
  const tasks = [task({ id: "a" })];
  assert.strictEqual(activeFilterCount(EMPTY_FILTERS), 0);
  assert.strictEqual(filterTaskTree(tasks, EMPTY_FILTERS, { assigneesByTask: {}, today: TODAY }), tasks);
});

test("filtro de texto conserva los ancestros de una subtarea que coincide", () => {
  const tasks = [
    task({ id: "padre", title: "Diseño" }),
    task({ id: "hijo", title: "Wireframe de login", parentTaskId: "padre" }),
    task({ id: "otro", title: "Comprar café" })
  ];
  const out = filterTaskTree(tasks, { ...EMPTY_FILTERS, text: "wireframe" }, { assigneesByTask: {}, today: TODAY });
  assert.deepStrictEqual(
    out.map((t) => t.id),
    ["padre", "hijo"]
  );
});

test("si el padre coincide, arrastra a sus descendientes", () => {
  const tasks = [
    task({ id: "padre", title: "Diseño" }),
    task({ id: "hijo", title: "Wireframe", parentTaskId: "padre" }),
    task({ id: "nieto", title: "Revisión", parentTaskId: "hijo" })
  ];
  const out = filterTaskTree(tasks, { ...EMPTY_FILTERS, text: "diseño" }, { assigneesByTask: {}, today: TODAY });
  assert.deepStrictEqual(
    out.map((t) => t.id),
    ["padre", "hijo", "nieto"]
  );
});

test("filtro por persona usa el mapa de responsables", () => {
  const tasks = [task({ id: "a" }), task({ id: "b" })];
  const out = filterTaskTree(
    tasks,
    { ...EMPTY_FILTERS, people: ["Dani"] },
    { assigneesByTask: { a: ["Dani", "Luis"], b: ["Luis"] }, today: TODAY }
  );
  assert.deepStrictEqual(
    out.map((t) => t.id),
    ["a"]
  );
});

test("hideDone oculta Completed y Cancelled", () => {
  const tasks = [task({ id: "a", status: "Completed" }), task({ id: "b", status: "Cancelled" }), task({ id: "c" })];
  const out = filterTaskTree(tasks, { ...EMPTY_FILTERS, hideDone: true }, { assigneesByTask: {}, today: TODAY });
  assert.deepStrictEqual(
    out.map((t) => t.id),
    ["c"]
  );
});

test("bucket 'overdue' solo trae vencidas abiertas; 'nodate' solo sin fechas", () => {
  const tasks = [
    task({ id: "vencida", due: "2026-03-01" }),
    task({ id: "vencida-hecha", due: "2026-03-01", status: "Completed" }),
    task({ id: "futura", due: "2026-03-20" }),
    task({ id: "sin-fecha" })
  ];
  const ctx = { assigneesByTask: {}, today: TODAY };
  assert.deepStrictEqual(
    filterTaskTree(tasks, { ...EMPTY_FILTERS, date: "overdue" }, ctx).map((t) => t.id),
    ["vencida"]
  );
  assert.deepStrictEqual(
    filterTaskTree(tasks, { ...EMPTY_FILTERS, date: "nodate" }, ctx).map((t) => t.id),
    ["sin-fecha"]
  );
});

// --- orden ----------------------------------------------------------------

test("sortTasks('due') manda las tareas sin fecha al final", () => {
  const tasks = [task({ id: "sin" }), task({ id: "tarde", due: "2026-04-01" }), task({ id: "pronto", due: "2026-03-11" })];
  assert.deepStrictEqual(
    sortTasks(tasks, "due").map((t) => t.id),
    ["pronto", "tarde", "sin"]
  );
});

test("sortTasks('priority') ordena High > Medium > Low", () => {
  const tasks = [task({ id: "low", priority: "Low" }), task({ id: "high", priority: "High" }), task({ id: "med" })];
  assert.deepStrictEqual(
    sortTasks(tasks, "priority").map((t) => t.id),
    ["high", "med", "low"]
  );
});

test("sortTasks('manual') respeta position", () => {
  const tasks = [task({ id: "c", position: 2 }), task({ id: "a", position: 0 }), task({ id: "b", position: 1 })];
  assert.deepStrictEqual(
    sortTasks(tasks, "manual").map((t) => t.id),
    ["a", "b", "c"]
  );
});

test("reorderIds mueve antes, después y al final", () => {
  const ids = ["a", "b", "c", "d"];
  assert.deepStrictEqual(reorderIds(ids, "d", "b", "before"), ["a", "d", "b", "c"]);
  assert.deepStrictEqual(reorderIds(ids, "a", "c", "after"), ["b", "c", "a", "d"]);
  assert.deepStrictEqual(reorderIds(ids, "a", null), ["b", "c", "d", "a"]);
  assert.deepStrictEqual(reorderIds(ids, "a", "a"), ["b", "c", "d", "a"]);
});

test("reorderIds ignora un target inexistente y manda la tarea al final", () => {
  assert.deepStrictEqual(reorderIds(["a", "b"], "a", "zz"), ["b", "a"]);
});

test("nextPosition devuelve max+1 y 0 en lista vacía", () => {
  assert.strictEqual(nextPosition([]), 0);
  assert.strictEqual(nextPosition([{ position: 0 }, { position: 4 }]), 5);
});

// --- estadísticas ---------------------------------------------------------

test("computeStats: % excluye canceladas y cuenta vencidas", () => {
  const tasks = [
    task({ id: "1", status: "Completed" }),
    task({ id: "2", status: "InProgress", due: "2026-03-01" }),
    task({ id: "3", status: "Blocked" }),
    task({ id: "4", status: "Cancelled" }),
    task({ id: "5", status: "Pending", due: "2026-03-12" })
  ];
  const s = computeStats(tasks, TODAY);
  assert.strictEqual(s.total, 5);
  assert.strictEqual(s.done, 1);
  assert.strictEqual(s.overdue, 1);
  assert.strictEqual(s.dueSoon, 1);
  assert.strictEqual(s.pct, 25); // 1 de 4 no canceladas
});

test("computeStats: proyecto vacío no divide entre cero", () => {
  assert.strictEqual(computeStats([], TODAY).pct, 0);
});

// --- timeline -------------------------------------------------------------

test("timelineRange nunca baja de 21 días y contiene hoy", () => {
  const range = timelineRange([task({ id: "a", startDate: "2026-03-09", due: "2026-03-11" })], TODAY);
  assert.ok(range.days >= 21);
  assert.ok(range.start <= TODAY && range.end >= TODAY);
});

test("timelineBar: tarea solo con due se dibuja como hito de 1 día", () => {
  const range = { start: "2026-03-01", end: "2026-03-20", days: 20 };
  const bar = timelineBar(task({ id: "a", due: "2026-03-11" }), range);
  assert.ok(bar);
  assert.strictEqual(Math.round(bar!.offsetPct), 50);
  assert.strictEqual(Math.round(bar!.widthPct), 5);
});

test("timelineBar: sin fechas devuelve null", () => {
  const range = { start: "2026-03-01", end: "2026-03-20", days: 20 };
  assert.strictEqual(timelineBar(task({ id: "a" }), range), null);
});

test("timelineBar tolera due anterior a start (rango invertido)", () => {
  const range = { start: "2026-03-01", end: "2026-03-20", days: 20 };
  const bar = timelineBar(task({ id: "a", startDate: "2026-03-15", due: "2026-03-05" }), range);
  assert.ok(bar);
  assert.strictEqual(bar!.start, "2026-03-05");
  assert.strictEqual(bar!.end, "2026-03-15");
});

// --- jerarquía ------------------------------------------------------------

test("isDescendantOf detecta el subárbol y evita ciclos al anidar", async () => {
  const { isDescendantOf, subtreeIds } = await import("../../src/lib/domain/board.ts");
  const tasks = [
    task({ id: "abuelo" }),
    task({ id: "padre", parentTaskId: "abuelo" }),
    task({ id: "hijo", parentTaskId: "padre" }),
    task({ id: "ajeno" })
  ];
  assert.strictEqual(isDescendantOf(tasks, "abuelo", "hijo"), true);
  assert.strictEqual(isDescendantOf(tasks, "abuelo", "abuelo"), true);
  assert.strictEqual(isDescendantOf(tasks, "hijo", "abuelo"), false);
  assert.strictEqual(isDescendantOf(tasks, "abuelo", "ajeno"), false);
  assert.deepStrictEqual(subtreeIds(tasks, "padre").sort(), ["hijo", "padre"]);
});

// --- huella de la estructura ----------------------------------------------

test("boardRevision cambia con la estructura y NO con el contenido de las filas", async () => {
  const { boardRevision } = await import("../../src/lib/domain/board.ts");
  const grupos = [
    { id: "g1", position: 0 },
    { id: "g2", position: 1 }
  ];
  const tareas = [task({ id: "a", position: 0 }), task({ id: "b", parentTaskId: "a", position: 0 })];
  const base = boardRevision(tareas, grupos);

  // Determinista: la misma entrada da siempre la misma huella.
  assert.strictEqual(boardRevision(tareas, grupos), base);

  // Renombrar o cambiar de estado NO la mueve: eso ya lo lleva el estado
  // optimista del cliente, y resincronizar ahí pisaría una edición en vuelo.
  const editada = tareas.map((t) => ({ ...t, title: "otro", status: "Completed" as const, urgent: true }));
  assert.strictEqual(boardRevision(editada, grupos), base);

  // Lo que sí la mueve: añadir, reanidar, cambiar de grupo, reordenar.
  assert.notStrictEqual(boardRevision([...tareas, task({ id: "c", position: 1 })], grupos), base);
  assert.notStrictEqual(boardRevision([tareas[0]!], grupos), base);
  assert.notStrictEqual(boardRevision(tareas.map((t) => ({ ...t, parentTaskId: null })), grupos), base);
  assert.notStrictEqual(boardRevision(tareas.map((t) => ({ ...t, groupId: "g2" })), grupos), base);
  assert.notStrictEqual(boardRevision(tareas.map((t) => ({ ...t, position: t.position + 1 })), grupos), base);

  // Y un grupo nuevo, aunque venga vacío: es justo lo que crea una plantilla.
  assert.notStrictEqual(boardRevision(tareas, [...grupos, { id: "g3", position: 2 }]), base);
  assert.notStrictEqual(boardRevision(tareas, [grupos[1]!, grupos[0]!]), base);
});
