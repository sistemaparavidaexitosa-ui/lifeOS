import { test } from "node:test";
import assert from "node:assert/strict";
import { quadrantOf, changeQuadrant } from "../../src/lib/domain/eisenhower.ts";

test("quadrantOf: urgente + High => do (Hacer ahora)", () => {
  assert.strictEqual(quadrantOf({ urgent: true, priority: "High" }), "do");
});

test("quadrantOf: no urgente + High => plan (Planificar)", () => {
  assert.strictEqual(quadrantOf({ urgent: false, priority: "High" }), "plan");
});

test("quadrantOf: urgente + no importante => delegate", () => {
  assert.strictEqual(quadrantOf({ urgent: true, priority: "Medium" }), "delegate");
  assert.strictEqual(quadrantOf({ urgent: true, priority: "Low" }), "delegate");
});

test("quadrantOf: no urgente + no importante => drop", () => {
  assert.strictEqual(quadrantOf({ urgent: false, priority: "Low" }), "drop");
});

test("changeQuadrant: mover a 'plan' fija urgent=false, priority=High (BR-023)", () => {
  const r = changeQuadrant({ status: "Pending" }, "plan");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.urgent, false);
  assert.strictEqual(r.priority, "High");
});

test("changeQuadrant: rechaza reclasificar una tarea Completed (FR-VIEW-008)", () => {
  const r = changeQuadrant({ status: "Completed" }, "do");
  assert.strictEqual(r.ok, false);
});

test("changeQuadrant: rechaza reclasificar una tarea Cancelled", () => {
  const r = changeQuadrant({ status: "Cancelled" }, "do");
  assert.strictEqual(r.ok, false);
});

test("round-trip: quadrantOf(changeQuadrant(...)) es estable para los 4 cuadrantes", () => {
  for (const q of ["do", "plan", "delegate", "drop"] as const) {
    const r = changeQuadrant({ status: "Pending" }, q);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(quadrantOf({ urgent: r.urgent!, priority: r.priority! }), q);
  }
});
