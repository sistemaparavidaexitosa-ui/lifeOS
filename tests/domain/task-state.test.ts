import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, isOverdue, effectiveStatus, evaluateTransition } from "../../src/lib/domain/task-state.ts";

test("canTransition: Pending -> InProgress permitido", () => {
  assert.strictEqual(canTransition("Pending", "InProgress"), true);
});

test("canTransition: Completed -> cualquier cosa NO permitido (estado terminal)", () => {
  assert.strictEqual(canTransition("Completed", "InProgress"), false);
  assert.strictEqual(canTransition("Completed", "Pending"), false);
});

test("isOverdue: tarea Pending con due en el pasado es overdue", () => {
  assert.strictEqual(isOverdue({ status: "Pending", due: "2020-01-01" }, "2026-08-12"), true);
});

test("isOverdue: tarea Completed nunca es overdue aunque due sea pasado (BR-006)", () => {
  assert.strictEqual(isOverdue({ status: "Completed", due: "2020-01-01" }, "2026-08-12"), false);
});

test("effectiveStatus: Overdue es derivado, no reemplaza status persistido", () => {
  assert.strictEqual(effectiveStatus({ status: "Pending", due: "2020-01-01" }, "2026-08-12"), "Overdue");
  assert.strictEqual(effectiveStatus({ status: "Pending", due: "2099-01-01" }, "2026-08-12"), "Pending");
});

test("evaluateTransition: rechaza completar con dependencia abierta (FR-EXE-005)", () => {
  const r = evaluateTransition({ status: "InProgress", deps: ["t2"] }, "Completed", { t2: "Pending" });
  assert.strictEqual(r.ok, false);
  assert.match(r.message ?? "", /Faltan dependencias/);
});

test("evaluateTransition: permite completar cuando todas las dependencias están Completed", () => {
  const r = evaluateTransition({ status: "InProgress", deps: ["t2"] }, "Completed", { t2: "Completed" });
  assert.strictEqual(r.ok, true);
});

test("evaluateTransition: transición inválida es rechazada con mensaje", () => {
  const r = evaluateTransition({ status: "Completed", deps: [] }, "Pending", {});
  assert.strictEqual(r.ok, false);
  assert.match(r.message ?? "", /no permitida/);
});
