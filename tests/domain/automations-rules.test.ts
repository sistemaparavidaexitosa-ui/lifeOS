// tests/domain/automations-rules.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decide,
  validateAction,
  isImpactAction,
  type AutomationLike,
  type AutomationEvent
} from "../../src/lib/domain/automations/rules.ts";

function regla(over: Partial<AutomationLike> = {}): AutomationLike {
  return {
    id: "a1",
    name: "Regla",
    enabled: true,
    authorized: true,
    triggerType: "task.status_changed",
    triggerParams: {},
    actionType: "log_entry",
    actionParams: { text: "algo pasó" },
    ...over
  };
}

function evento(over: Partial<AutomationEvent> = {}): AutomationEvent {
  return { type: "task.status_changed", taskId: "t1", projectId: "p1", toStatus: "Completed", ...over };
}

test("decide: una regla que casa se ejecuta", () => {
  const d = decide(evento(), [regla()]);
  assert.deepStrictEqual(d.map((x) => x.kind), ["run"]);
});

test("decide: una regla apagada no se mira siquiera", () => {
  assert.deepStrictEqual(decide(evento(), [regla({ enabled: false })]), []);
});

test("decide: un disparador de otro tipo no casa", () => {
  assert.deepStrictEqual(decide(evento({ type: "comment.added" }), [regla()]), []);
});

test("decide: el filtro por estado acota", () => {
  const soloBloqueadas = regla({ triggerParams: { to: "Blocked" } });
  assert.deepStrictEqual(decide(evento({ toStatus: "Completed" }), [soloBloqueadas]), []);
  assert.strictEqual(decide(evento({ toStatus: "Blocked" }), [soloBloqueadas])[0]?.kind, "run");
});

test("decide: el filtro por proyecto acota", () => {
  const soloP2 = regla({ triggerParams: { projectId: "p2" } });
  assert.deepStrictEqual(decide(evento({ projectId: "p1" }), [soloP2]), []);
  assert.strictEqual(decide(evento({ projectId: "p2" }), [soloP2])[0]?.kind, "run");
});

test("decide: sin filtro de proyecto, la regla vale para todo el espacio", () => {
  assert.strictEqual(decide(evento({ projectId: "el-que-sea" }), [regla()])[0]?.kind, "run");
});

test("decide: `soloMenciones` exige que el comentario me mencione", () => {
  const r = regla({ triggerType: "comment.added", triggerParams: { soloMenciones: true } });
  assert.deepStrictEqual(decide(evento({ type: "comment.added", mentionsMe: false }), [r]), []);
  assert.strictEqual(decide(evento({ type: "comment.added", mentionsMe: true }), [r])[0]?.kind, "run");
});

test("decide: sin `soloMenciones`, cualquier comentario dispara", () => {
  const r = regla({ triggerType: "comment.added" });
  assert.strictEqual(decide(evento({ type: "comment.added", mentionsMe: false }), [r])[0]?.kind, "run");
});

test("decide: una acción de IMPACTO sin autorizar se PROPONE, no se ejecuta (FR-AUT-002)", () => {
  const r = regla({ authorized: false, actionType: "set_status", actionParams: { to: "Blocked" } });
  const [d] = decide(evento(), [r]);
  assert.strictEqual(d?.kind, "propose");
  assert.match(d?.kind === "propose" ? d.reason : "", /FR-AUT-002/);
});

test("decide: una acción SIN impacto no necesita autorización", () => {
  // Anotar en tu bitácora no lo ve nadie más y se deshace solo.
  const r = regla({ authorized: false, actionType: "log_entry" });
  assert.strictEqual(decide(evento(), [r])[0]?.kind, "run");
});

test("isImpactAction: crear tarea y mover estado sí; anotar y recordar no", () => {
  assert.strictEqual(isImpactAction("create_task"), true);
  assert.strictEqual(isImpactAction("set_status"), true);
  assert.strictEqual(isImpactAction("log_entry"), false);
  assert.strictEqual(isImpactAction("create_reminder"), false);
});

test("decide: una regla que repetiría su propio disparo se salta — el bucle no llega a empezar", () => {
  const bucle = regla({ actionType: "set_status", actionParams: { to: "Completed" } });
  const [d] = decide(evento({ toStatus: "Completed" }), [bucle]);
  assert.strictEqual(d?.kind, "skip");
  assert.match(d?.kind === "skip" ? d.reason : "", /repetiría el evento/);
});

test("decide: mover a OTRO estado sí es legítimo", () => {
  const r = regla({ actionType: "set_status", actionParams: { to: "Blocked" } });
  assert.strictEqual(decide(evento({ toStatus: "Completed" }), [r])[0]?.kind, "run");
});

test("decide: una regla con parámetros incompletos se salta, con motivo", () => {
  const r = regla({ actionType: "create_task", actionParams: {} });
  const [d] = decide(evento(), [r]);
  assert.strictEqual(d?.kind, "skip");
  assert.match(d?.kind === "skip" ? d.reason : "", /qué tarea crear/);
});

test("decide: devuelve TODAS las decisiones, no solo las ejecutables", () => {
  // Una regla que no hizo nada y no dejó rastro es una regla que el usuario
  // cree rota.
  const d = decide(evento(), [
    regla({ id: "ok" }),
    regla({ id: "prop", authorized: false, actionType: "create_task", actionParams: { title: "X" } }),
    regla({ id: "mal", actionType: "set_status", actionParams: {} })
  ]);
  assert.deepStrictEqual(d.map((x) => x.kind), ["run", "propose", "skip"]);
});

test("validateAction: cada acción exige lo suyo", () => {
  assert.match(validateAction(regla({ actionType: "create_task", actionParams: {} })) ?? "", /qué tarea/);
  assert.match(validateAction(regla({ actionType: "set_status", actionParams: {} })) ?? "", /a qué estado/);
  assert.match(validateAction(regla({ actionType: "log_entry", actionParams: {} })) ?? "", /qué anotar/);
  assert.match(validateAction(regla({ actionType: "create_reminder", actionParams: {} })) ?? "", /para cuándo/);
});

test("validateAction: con los parámetros puestos no hay queja", () => {
  assert.strictEqual(validateAction(regla({ actionType: "create_reminder", actionParams: { preset: "manana" } })), null);
});

test("validateAction: un parámetro vacío cuenta como ausente", () => {
  assert.ok(validateAction(regla({ actionType: "log_entry", actionParams: { text: "" } })));
});
