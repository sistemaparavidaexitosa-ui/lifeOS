// tests/domain/insights-activity.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityFacts, type ActivitySnapshot } from "../../src/lib/domain/insights/facts/activity.ts";
import { addDaysISO } from "../../src/lib/domain/datetime.ts";

const HOY = "2026-08-23";
const hace = (d: number) => `${addDaysISO(HOY, -d)}T10:00:00Z`;

function snapshot(over: Partial<ActivitySnapshot> = {}): ActivitySnapshot {
  return { rows: [], mentions: [], projects: [], ...over };
}

const fila = (id: string, at: string, projectId: string | null = "p1") => ({ id, type: "comment", projectId, at });
const mencion = (commentId: string, at: string, over: Partial<ActivitySnapshot["mentions"][number]> = {}) => ({
  commentId,
  taskId: "t1",
  taskTitle: "Revisar contrato",
  at,
  answered: false,
  ...over
});

test("activityFacts: sin nada no inventa", () => {
  assert.deepStrictEqual(activityFacts(snapshot(), HOY), []);
});

test("activityFacts: las menciones sin leer van en UN hecho, con la más antigua", () => {
  const facts = activityFacts(
    snapshot({ mentions: [mencion("c1", hace(1)), mencion("c2", hace(5), { taskTitle: "La vieja" })] }),
    HOY
  );
  const sinLeer = facts.filter((f) => f.id === "activity.unread-mentions");
  assert.strictEqual(sinLeer.length, 1, "un hecho agregado, no uno por mención");
  assert.match(sinLeer[0]?.label ?? "", /2 mención\(es\) sin leer/);
  assert.match(sinLeer[0]?.label ?? "", /hace 5 días/);
  assert.match(sinLeer[0]?.label ?? "", /"La vieja"/);
});

test("activityFacts: una mención sin contestar en días se reporta aparte", () => {
  const facts = activityFacts(snapshot({ mentions: [mencion("c1", hace(4))] }), HOY);
  const sinRespuesta = facts.find((f) => f.id === "activity.mention-unanswered.c1");
  assert.ok(sinRespuesta);
  assert.match(sinRespuesta.label, /hace 4 días y nadie ha escrito nada después/);
});

test("activityFacts: una mención de esta mañana sin contestar no es un hallazgo", () => {
  const facts = activityFacts(snapshot({ mentions: [mencion("c1", hace(0))] }), HOY);
  assert.strictEqual(facts.find((f) => f.id.startsWith("activity.mention-unanswered")), undefined);
});

test("activityFacts: si alguien contestó, no hay deuda pendiente", () => {
  const facts = activityFacts(snapshot({ mentions: [mencion("c1", hace(6), { answered: true })] }), HOY);
  assert.strictEqual(facts.find((f) => f.id.startsWith("activity.mention-unanswered")), undefined);
});

test("activityFacts: NINGÚN hecho nombra a una persona", () => {
  // La seudonimización del motor cubre cuentas y dependientes, no a los
  // compañeros de espacio. Este extractor no manda nombres de terceros.
  const facts = activityFacts(
    snapshot({
      mentions: [mencion("c1", hace(5))],
      rows: Array.from({ length: 8 }, (_, i) => fila(`a${i}`, hace(1))),
      projects: [{ id: "p1", title: "Proyecto" }]
    }),
    HOY
  );
  assert.ok(facts.length > 0);
  for (const f of facts) {
    assert.doesNotMatch(f.label, /@|\bana\b|\bluis\b/i, `el hecho ${f.id} no debe nombrar a nadie`);
  }
});

test("activityFacts: un proyecto que concentra el movimiento se señala", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => fila(`a${i}`, hace(1), "p1")),
    ...Array.from({ length: 2 }, (_, i) => fila(`b${i}`, hace(2), "p2"))
  ];
  const facts = activityFacts(
    snapshot({ rows, projects: [{ id: "p1", title: "El ruidoso" }, { id: "p2", title: "El otro" }] }),
    HOY
  );
  const busy = facts.find((f) => f.id === "activity.busy-project.p1");
  assert.ok(busy);
  assert.match(busy.label, /"El ruidoso" concentra 7 de los 9 movimientos/);
});

test("activityFacts: con poco movimiento no se habla de concentración", () => {
  // Dos eventos y uno acapara el 100 %: cierto, e inútil.
  const rows = [fila("a", hace(1), "p1"), fila("b", hace(1), "p2")];
  const facts = activityFacts(snapshot({ rows, projects: [] }), HOY);
  assert.strictEqual(facts.find((f) => f.id.startsWith("activity.busy-project")), undefined);
});

test("activityFacts: con un solo proyecto no hay nada que comparar", () => {
  const rows = Array.from({ length: 8 }, (_, i) => fila(`a${i}`, hace(1), "p1"));
  const facts = activityFacts(snapshot({ rows, projects: [{ id: "p1", title: "Único" }] }), HOY);
  assert.strictEqual(facts.find((f) => f.id.startsWith("activity.busy-project")), undefined);
});

test("activityFacts: la concentración solo mira la última semana", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => fila(`viejo${i}`, hace(20), "p1")),
    fila("nuevo", hace(1), "p2")
  ];
  const facts = activityFacts(
    snapshot({ rows, projects: [{ id: "p1", title: "Viejo" }, { id: "p2", title: "Nuevo" }] }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id.startsWith("activity.busy-project")), undefined);
});

test("activityFacts: un espacio callado se reporta", () => {
  const facts = activityFacts(snapshot({ rows: [fila("a", hace(15))] }), HOY);
  const quiet = facts.find((f) => f.id === "activity.quiet");
  assert.ok(quiet);
  assert.match(quiet.label, /desde hace 15 días/);
});

test("activityFacts: un espacio sin NINGUNA actividad no está callado, está empezando", () => {
  assert.strictEqual(activityFacts(snapshot({ rows: [] }), HOY).find((f) => f.id === "activity.quiet"), undefined);
});

test("activityFacts: actividad reciente no es silencio", () => {
  const facts = activityFacts(snapshot({ rows: [fila("a", hace(2))] }), HOY);
  assert.strictEqual(facts.find((f) => f.id === "activity.quiet"), undefined);
});

test("activityFacts: todo hecho declara su dominio, refs y peso entre 0 y 1", () => {
  const facts = activityFacts(
    snapshot({
      mentions: [mencion("c1", hace(6))],
      rows: [...Array.from({ length: 7 }, (_, i) => fila(`a${i}`, hace(1), "p1")), fila("b", hace(1), "p2")],
      projects: [{ id: "p1", title: "P1" }, { id: "p2", title: "P2" }]
    }),
    HOY
  );
  assert.ok(facts.length >= 3);
  for (const f of facts) {
    assert.strictEqual(f.domain, "activity");
    assert.ok(f.weight >= 0 && f.weight <= 1, `peso fuera de rango en ${f.id}: ${f.weight}`);
    assert.ok(f.refs.length > 0, `hecho sin refs: ${f.id}`);
  }
});

test("activityFacts: los hechos salen ordenados de más a menos anómalo", () => {
  const facts = activityFacts(
    snapshot({ mentions: [mencion("c1", hace(6)), mencion("c2", hace(3))], rows: [fila("a", hace(20))] }),
    HOY
  );
  for (let i = 1; i < facts.length; i++) {
    assert.ok((facts[i - 1]?.weight ?? 0) >= (facts[i]?.weight ?? 0));
  }
});
