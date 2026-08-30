// tests/domain/insights-execution.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { executionFacts, type ExecutionSnapshot, type ExecutionTaskLike } from "../../src/lib/domain/insights/facts/execution.ts";
import type { TaskStatus } from "../../src/lib/domain/types.ts";

const HOY = "2026-08-23";

function tarea(id: string, over: Partial<ExecutionTaskLike> = {}): ExecutionTaskLike {
  return { id, title: `Tarea ${id}`, projectId: "p1", status: "Pending", due: null, deps: [], completedAtISO: null, ...over };
}

function snapshot(over: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  return { projects: [], tasks: [], ...over };
}

const proyecto = (id: string, status: ExecutionSnapshot["projects"][number]["status"] = "Active") => ({
  id,
  title: `Proyecto ${id}`,
  status
});

test("executionFacts: una cartera sana no produce ningún hecho", () => {
  const facts = executionFacts(snapshot({ projects: [proyecto("p1")], tasks: [tarea("t1", { due: "2099-01-01" })] }), HOY);
  assert.deepStrictEqual(facts, []);
});

test("executionFacts: lo vencido va en UN hecho, con recuento y la más antigua", () => {
  const facts = executionFacts(
    snapshot({
      tasks: [
        tarea("t1", { due: "2026-08-20", title: "Reciente" }),
        tarea("t2", { due: "2026-08-13", title: "La vieja" }),
        tarea("t3", { due: "2099-01-01" })
      ]
    }),
    HOY
  );
  const vencidas = facts.filter((f) => f.id === "execution.overdue");
  assert.strictEqual(vencidas.length, 1, "un hecho agregado, no uno por tarea");
  assert.match(vencidas[0]?.label ?? "", /2 de 3 tareas abiertas están vencidas/);
  assert.match(vencidas[0]?.label ?? "", /"La vieja", con 10 días de retraso/);
});

test("executionFacts: una tarea Completada con due pasado no cuenta como vencida (BR-006)", () => {
  const facts = executionFacts(snapshot({ tasks: [tarea("t1", { due: "2020-01-01", status: "Completed" })] }), HOY);
  assert.strictEqual(facts.find((f) => f.id === "execution.overdue"), undefined);
});

test("executionFacts: el peso de lo vencido es la proporción, no el número", () => {
  const pocasDeMuchas = executionFacts(
    snapshot({ tasks: [tarea("t1", { due: "2026-08-01" }), ...Array.from({ length: 19 }, (_, i) => tarea(`x${i}`))] }),
    HOY
  ).find((f) => f.id === "execution.overdue");
  const pocasDePocas = executionFacts(snapshot({ tasks: [tarea("t1", { due: "2026-08-01" })] }), HOY).find(
    (f) => f.id === "execution.overdue"
  );
  assert.ok((pocasDePocas?.weight ?? 0) > (pocasDeMuchas?.weight ?? 0));
});

test("executionFacts: proyecto activo sin completar nada en dos semanas está estancado", () => {
  const facts = executionFacts(
    snapshot({
      projects: [proyecto("p1")],
      tasks: [tarea("t1", { status: "Completed", completedAtISO: "2026-08-01" }), tarea("t2")]
    }),
    HOY
  );
  const stalled = facts.find((f) => f.id === "execution.stalled.p1");
  assert.ok(stalled);
  assert.match(stalled.label, /lleva 22 días sin completar ninguna tarea/);
  assert.match(stalled.label, /1 abiertas/);
});

test("executionFacts: un proyecto que nunca completó nada NO está estancado, no ha empezado", () => {
  const facts = executionFacts(snapshot({ projects: [proyecto("p1")], tasks: [tarea("t1")] }), HOY);
  assert.strictEqual(facts.find((f) => f.id === "execution.stalled.p1"), undefined);
});

test("executionFacts: un proyecto sin tareas abiertas no está estancado, está terminado", () => {
  const facts = executionFacts(
    snapshot({
      projects: [proyecto("p1")],
      tasks: [tarea("t1", { status: "Completed", completedAtISO: "2026-01-01" })]
    }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id === "execution.stalled.p1"), undefined);
});

test("executionFacts: un proyecto en pausa no se juzga por estancado", () => {
  const facts = executionFacts(
    snapshot({
      projects: [proyecto("p1", "OnHold")],
      tasks: [tarea("t1", { status: "Completed", completedAtISO: "2026-01-01" }), tarea("t2")]
    }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id === "execution.stalled.p1"), undefined);
});

test("executionFacts: una tarea con todas sus dependencias completas está desbloqueada y nadie avisó", () => {
  const facts = executionFacts(
    snapshot({
      tasks: [
        tarea("dep1", { status: "Completed", completedAtISO: HOY }),
        tarea("t1", { deps: ["dep1"], title: "Ya se puede" })
      ]
    }),
    HOY
  );
  const unblocked = facts.find((f) => f.id === "execution.unblocked");
  assert.ok(unblocked);
  assert.match(unblocked.label, /"Ya se puede"/);
});

test("executionFacts: con una dependencia abierta NO está desbloqueada", () => {
  const facts = executionFacts(
    snapshot({ tasks: [tarea("dep1", { status: "InProgress" }), tarea("t1", { deps: ["dep1"] })] }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id === "execution.unblocked"), undefined);
});

test("executionFacts: una tarea sin dependencias nunca estuvo bloqueada, así que no se 'desbloquea'", () => {
  const facts = executionFacts(snapshot({ tasks: [tarea("t1")] }), HOY);
  assert.strictEqual(facts.find((f) => f.id === "execution.unblocked"), undefined);
});

test("executionFacts: una dependencia borrada no bloquea", () => {
  const facts = executionFacts(snapshot({ tasks: [tarea("t1", { deps: ["fantasma"] })] }), HOY);
  assert.ok(facts.find((f) => f.id === "execution.unblocked"), "la dependencia ya no existe: el trabajo puede empezar");
});

test("executionFacts: más de cinco tareas En Progreso a la vez se reporta", () => {
  const enCurso = Array.from({ length: 7 }, (_, i) => tarea(`t${i}`, { status: "InProgress" }));
  const facts = executionFacts(snapshot({ tasks: enCurso }), HOY);
  const wip = facts.find((f) => f.id === "execution.wip");
  assert.ok(wip);
  assert.match(wip.label, /7 tareas En Progreso/);
});

test("executionFacts: exactamente cinco En Progreso todavía no se reporta", () => {
  const enCurso = Array.from({ length: 5 }, (_, i) => tarea(`t${i}`, { status: "InProgress" }));
  assert.strictEqual(executionFacts(snapshot({ tasks: enCurso }), HOY).find((f) => f.id === "execution.wip"), undefined);
});

test("executionFacts: las tareas Bloqueadas se cuentan aparte de las vencidas", () => {
  const facts = executionFacts(
    snapshot({ tasks: [tarea("t1", { status: "Blocked", title: "Atorada" }), tarea("t2")] }),
    HOY
  );
  const blocked = facts.find((f) => f.id === "execution.blocked");
  assert.ok(blocked);
  assert.match(blocked.label, /"Atorada"/);
});

test("executionFacts: todo hecho declara su dominio, refs y un peso entre 0 y 1", () => {
  const facts = executionFacts(
    snapshot({
      projects: [proyecto("p1")],
      tasks: [
        tarea("t1", { due: "2026-01-01" }),
        tarea("t2", { status: "Blocked" }),
        tarea("t3", { status: "Completed", completedAtISO: "2026-01-05" }),
        ...Array.from({ length: 6 }, (_, i) => tarea(`w${i}`, { status: "InProgress" as TaskStatus }))
      ]
    }),
    HOY
  );
  assert.ok(facts.length >= 3);
  for (const f of facts) {
    assert.strictEqual(f.domain, "execution");
    assert.ok(f.weight >= 0 && f.weight <= 1, `peso fuera de rango en ${f.id}: ${f.weight}`);
    assert.ok(f.refs.length > 0, `hecho sin refs: ${f.id}`);
  }
});

test("executionFacts: los hechos salen ordenados de más a menos anómalo", () => {
  const facts = executionFacts(
    snapshot({
      projects: [proyecto("p1")],
      tasks: [
        tarea("t1", { due: "2026-01-01" }),
        tarea("t2", { status: "Blocked" }),
        tarea("t3", { status: "Completed", completedAtISO: "2026-01-05" })
      ]
    }),
    HOY
  );
  for (let i = 1; i < facts.length; i++) {
    assert.ok((facts[i - 1]?.weight ?? 0) >= (facts[i]?.weight ?? 0));
  }
});
