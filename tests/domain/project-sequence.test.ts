import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestProjectSequence } from "../../src/lib/domain/project-sequence.ts";

test("suggestProjectSequence: vacío si no hay tareas activas", () => {
  const r = suggestProjectSequence([]);
  assert.deepStrictEqual(r.order, []);
  assert.strictEqual(r.confidence, "Baja");
});

test("suggestProjectSequence: respeta dependencias (una tarea nunca antes que su dependencia)", () => {
  const r = suggestProjectSequence([
    { id: "t1", status: "Pending", priority: "Medium", est: 30, deps: [] },
    { id: "t2", status: "Pending", priority: "High", est: 20, deps: ["t1"] },
    { id: "t3", status: "Blocked", priority: "Medium", est: 60, deps: ["t2"] }
  ]);
  const idx = (id: string) => r.order.indexOf(id);
  assert.ok(idx("t1") < idx("t2"), "t1 (dependencia) debe ir antes que t2");
  assert.ok(idx("t2") < idx("t3"), "t2 (dependencia) debe ir antes que t3");
});

test("suggestProjectSequence: entre tareas sin dependencias, prioriza mayor prioridad y menor estimación", () => {
  const r = suggestProjectSequence([
    { id: "low", status: "Pending", priority: "Low", est: 10, deps: [] },
    { id: "high", status: "Pending", priority: "High", est: 90, deps: [] }
  ]);
  assert.strictEqual(r.order[0], "high", "High debe ir antes que Low aunque tome más tiempo");
});

test("suggestProjectSequence: excluye tareas Completed y Cancelled del cálculo", () => {
  const r = suggestProjectSequence([
    { id: "done", status: "Completed", priority: "High", est: 10, deps: [] },
    { id: "cancelled", status: "Cancelled", priority: "High", est: 10, deps: [] },
    { id: "active", status: "Pending", priority: "Medium", est: 10, deps: [] }
  ]);
  assert.deepStrictEqual(r.order, ["active"]);
});

test("suggestProjectSequence: siempre incluye evidencia y supuestos (recomendación explicable, BR-022)", () => {
  const r = suggestProjectSequence([{ id: "t1", status: "Pending", priority: "Medium", est: 10, deps: [] }]);
  assert.ok(r.evidence.length > 0);
  assert.ok(r.assumptions.length > 0);
});

test("suggestProjectSequence: no muta el arreglo de entrada (es una función pura, no reordena nada por sí sola)", () => {
  const input = [
    { id: "a", status: "Pending" as const, priority: "Low" as const, est: 10, deps: [] },
    { id: "b", status: "Pending" as const, priority: "High" as const, est: 10, deps: [] }
  ];
  const before = JSON.stringify(input);
  suggestProjectSequence(input);
  assert.strictEqual(JSON.stringify(input), before);
});
