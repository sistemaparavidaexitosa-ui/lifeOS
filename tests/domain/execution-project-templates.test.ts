// tests/domain/execution-project-templates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROJECT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getProjectTemplate,
  templateSummary,
  plannedRows
} from "../../src/lib/domain/execution/project-templates.ts";

test("el catálogo trae las once plantillas y ningún id repetido", () => {
  assert.strictEqual(PROJECT_TEMPLATES.length, 11);
  const ids = PROJECT_TEMPLATES.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, "un id repetido haría que getProjectTemplate devolviera la otra");
});

test("toda plantilla tiene grupos, y todo grupo tiene tareas", () => {
  // Una plantilla que crea un grupo vacío es peor que no aplicarla: deja el
  // tablero con ruido y sin nada que hacer.
  for (const t of PROJECT_TEMPLATES) {
    assert.ok(t.groups.length > 0, `${t.id} no tiene grupos`);
    for (const g of t.groups) {
      assert.ok(g.tasks.length > 0, `${t.id} · el grupo "${g.name}" está vacío`);
      for (const task of g.tasks) assert.ok(task.title.trim().length > 2, `${t.id} · tarea sin título`);
    }
  }
});

test("toda plantilla se presenta: nombre y resumen", () => {
  for (const t of PROJECT_TEMPLATES) {
    assert.ok(t.name.trim().length > 3, `${t.id} sin nombre`);
    assert.ok(t.summary.trim().length > 20, `${t.id} sin resumen útil`);
  }
});

test("las plantillas que salen de un libro lo atribuyen", () => {
  // Se usa su estructura; decir de dónde viene es parte del trato.
  assert.match(getProjectTemplate("lean-startup")?.source ?? "", /Eric Ries/);
  assert.match(getProjectTemplate("doce-meses")?.source ?? "", /Ryan Daniel Moran/);
  assert.match(getProjectTemplate("embudo")?.source ?? "", /Dave McClure/);
});

test("toda plantilla declara una categoría conocida", () => {
  // La categoría es lo que agrupa el selector. Una plantilla con categoría
  // suelta no se pintaría en ningún `optgroup` y sería invisible.
  for (const t of PROJECT_TEMPLATES) {
    assert.ok(TEMPLATE_CATEGORIES.includes(t.category), `${t.id} tiene una categoría desconocida: ${t.category}`);
  }
});

test("las cuatro categorías tienen al menos una plantilla", () => {
  // Un `optgroup` vacío no se pinta, pero una categoría declarada y sin nada
  // dentro es una promesa a medias en el tipo.
  for (const c of TEMPLATE_CATEGORIES) {
    assert.ok(PROJECT_TEMPLATES.some((t) => t.category === c), `la categoría "${c}" está vacía`);
  }
});

test("hay plantillas de marketing y personales, no solo de trabajo", () => {
  assert.ok(PROJECT_TEMPLATES.filter((t) => t.category === "Marketing").length >= 2);
  assert.ok(PROJECT_TEMPLATES.filter((t) => t.category === "Personal").length >= 3);
});

test("los colores de grupo salen del design system, no son literales", () => {
  for (const t of PROJECT_TEMPLATES) {
    for (const g of t.groups) assert.match(g.color, /^var\(--c-[a-z]+\)$/, `${t.id} · color suelto en "${g.name}"`);
  }
});

test("getProjectTemplate: encuentra la que existe y no inventa la que no", () => {
  assert.strictEqual(getProjectTemplate("lean-startup")?.id, "lean-startup");
  assert.strictEqual(getProjectTemplate("no-existe"), undefined);
});

test("templateSummary: cuenta grupos, tareas y subtareas", () => {
  const t = {
    id: "x",
    category: "Personal" as const,
    name: "X",
    summary: "y",
    groups: [
      { name: "A", color: "var(--c-purple)", tasks: [{ title: "1", subtasks: ["a", "b"] }, { title: "2" }] },
      { name: "B", color: "var(--c-blue)", tasks: [{ title: "3" }] }
    ]
  };
  assert.deepStrictEqual(templateSummary(t), { groups: 2, tasks: 3, subtasks: 2 });
});

test("templateSummary: todas las del catálogo crean algo que vale la pena", () => {
  for (const t of PROJECT_TEMPLATES) {
    const s = templateSummary(t);
    assert.ok(s.tasks >= 6, `${t.id} solo crea ${s.tasks} tareas`);
  }
});

test("plannedRows: sobre un proyecto vacío, los grupos empiezan en cero", () => {
  const rows = plannedRows(getProjectTemplate("lanzamiento")!);
  assert.deepStrictEqual(rows.map((g) => g.position), [0, 1, 2, 3]);
});

test("plannedRows: al AÑADIR, los grupos empiezan después del último que había", () => {
  // Sin esto, dos grupos comparten posición y el orden del tablero pasa a
  // depender de cuál devuelva antes la base.
  const rows = plannedRows(getProjectTemplate("lanzamiento")!, { fromGroupPosition: 3 });
  assert.deepStrictEqual(rows.map((g) => g.position), [3, 4, 5, 6]);
});

test("plannedRows: las tareas siempre empiezan en 0 — su posición es dentro de SU grupo", () => {
  const rows = plannedRows(getProjectTemplate("contratar")!, { fromGroupPosition: 9 });
  for (const g of rows) assert.strictEqual(g.tasks[0]?.position, 0);
});

test("plannedRows: una tarea sin prioridad declarada cae en Medium, el default del esquema", () => {
  const rows = plannedRows(getProjectTemplate("software-v1")!);
  const todas = rows.flatMap((g) => g.tasks);
  assert.ok(todas.every((t) => ["High", "Medium", "Low"].includes(t.priority)));
  assert.ok(todas.some((t) => t.priority === "Medium"), "alguna debería quedarse con el default");
});

test("plannedRows: las subtareas viajan con su tarea, y por defecto son lista vacía", () => {
  const rows = plannedRows(getProjectTemplate("software-v1")!);
  const conSub = rows.flatMap((g) => g.tasks).filter((t) => t.subtasks.length);
  assert.ok(conSub.length > 0, "el software debería traer alguna subtarea");
  for (const g of rows) for (const t of g.tasks) assert.ok(Array.isArray(t.subtasks));
});

test("NINGUNA tarea de plantilla se marca como de impacto", () => {
  // `impact` alimenta «tres tareas de impacto» en Home y los minutos
  // comprometidos del día. Cuáles lo son esta semana es del usuario, y una
  // plantilla que marca ocho rompe las dos cosas.
  for (const t of PROJECT_TEMPLATES) {
    for (const g of t.groups) {
      for (const task of g.tasks) {
        assert.ok(!("impact" in task), `${t.id} · "${task.title}" trae impact`);
      }
    }
  }
});

test("NINGUNA tarea de plantilla trae fecha", () => {
  // El horizonte va en el nombre del grupo. Una fecha inventada llenaría el
  // tablero de vencidas y contaría como atraso en Home y en el motor.
  for (const t of PROJECT_TEMPLATES) {
    for (const g of t.groups) {
      for (const task of g.tasks) {
        assert.ok(!("due" in task) && !("startDate" in task), `${t.id} · "${task.title}" trae fecha`);
      }
    }
  }
});
