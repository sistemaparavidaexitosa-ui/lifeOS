// tests/domain/insights-growth.test.ts
// Desarrollo personal: el dominio que 0053 añadió para que «¿cómo van mis
// metas?» dejara de ser incontestable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { growthFacts, type GrowthSnapshot, type GoalLike, type BookLike } from "../../src/lib/domain/insights/facts/growth.ts";

const HOY = "2026-09-06";

function meta(over: Partial<GoalLike> = {}): GoalLike {
  return {
    id: "g1",
    title: "Correr un maratón",
    area: "Salud",
    status: "Activa",
    horizon: "2026-12-31",
    createdAt: "2026-01-01",
    keyResults: 2,
    pct: 50,
    ...over
  };
}

function libro(over: Partial<BookLike> = {}): BookLike {
  return { id: "b1", title: "Atomic Habits", status: "Leyendo", currentPage: 40, totalPages: 300, lastProgressISO: HOY, ...over };
}

function snapshot(over: Partial<GrowthSnapshot> = {}): GrowthSnapshot {
  return { goals: [meta()], books: [], ...over };
}

test("growthFacts: una meta activa sin resultados clave se reporta, porque su avance no puede moverse", () => {
  const facts = growthFacts(snapshot({ goals: [meta({ keyResults: 0, pct: null })] }), HOY);
  const f = facts.find((x) => x.id === "growth.goal-no-kr.g1");
  assert.ok(f);
  assert.match(f.label, /no tiene ningún resultado clave/);
  assert.deepStrictEqual(f.refs, [{ table: "personal_goals", id: "g1" }]);
});

test("growthFacts: una meta pausada o lograda no produce hechos SOBRE ELLA", () => {
  // Queda `growth.no-goals`, que habla de la ausencia y no de la meta: es
  // justamente lo que hay que decir cuando la única meta está pausada.
  for (const status of ["Pausada", "Lograda", "Abandonada"]) {
    const facts = growthFacts(snapshot({ goals: [meta({ status, keyResults: 0, horizon: "2020-01-01" })] }), HOY);
    assert.deepStrictEqual(facts.map((f) => f.id), ["growth.no-goals"], `${status} no debería hablar de la meta`);
  }
});

test("growthFacts: el horizonte vencido con la meta todavía activa se reporta con su retraso", () => {
  const facts = growthFacts(snapshot({ goals: [meta({ horizon: "2026-08-07" })] }), HOY);
  const f = facts.find((x) => x.id === "growth.goal-overdue.g1");
  assert.ok(f);
  assert.match(f.label, /venció hace 30 días/);
  assert.match(f.label, /al 50 %/);
});

test("growthFacts: sin avance resuelto la meta vencida se calla el porcentaje en vez de decir 0 %", () => {
  // `pct: null` es «no pude calcularlo», no «no ha avanzado». Es el caso del
  // mensaje diario, que corre sin sesión.
  const facts = growthFacts(snapshot({ goals: [meta({ horizon: "2026-08-07", pct: null })] }), HOY);
  const f = facts.find((x) => x.id === "growth.goal-overdue.g1");
  assert.ok(f);
  assert.ok(!f.label.includes("%"), `no debe afirmar un porcentaje: ${f.label}`);
});

test("growthFacts: una meta en riesgo compara avance contra calendario, no contra el reloj", () => {
  // Del 2026-01-01 al 2026-12-31 con corte el 2026-09-06: ~68 % transcurrido.
  const facts = growthFacts(snapshot({ goals: [meta({ pct: 10 })] }), HOY);
  const f = facts.find((x) => x.id === "growth.goal-at-risk.g1");
  assert.ok(f, "10 % de avance con 68 % de calendario debe ser riesgo");
  assert.match(f.label, /va al 10 %/);
});

test("growthFacts: una meta al día no se reporta como en riesgo", () => {
  const facts = growthFacts(snapshot({ goals: [meta({ pct: 70 })] }), HOY);
  assert.strictEqual(facts.find((x) => x.id === "growth.goal-at-risk.g1"), undefined);
});

test("growthFacts: la meta vencida no se reporta ADEMÁS como en riesgo", () => {
  // Dos hechos sobre lo mismo gastan dos huecos del contexto.
  const facts = growthFacts(snapshot({ goals: [meta({ horizon: "2026-08-07", pct: 10 })] }), HOY);
  assert.strictEqual(facts.filter((x) => x.id.startsWith("growth.goal-")).length, 1);
});

test("growthFacts: un libro parado más de dos semanas se reporta con lo que le falta", () => {
  const facts = growthFacts(snapshot({ books: [libro({ lastProgressISO: "2026-08-01" })] }), HOY);
  const f = facts.find((x) => x.id === "growth.book-stalled.b1");
  assert.ok(f);
  assert.match(f.label, /36 días sin avanzar/);
  assert.match(f.label, /faltan 260/);
});

test("growthFacts: un libro que NUNCA registró progreso no se reporta", () => {
  // Quien lee sin anotar páginas no tiene un problema de lectura.
  const facts = growthFacts(snapshot({ books: [libro({ lastProgressISO: null })] }), HOY);
  assert.strictEqual(facts.find((x) => x.id === "growth.book-stalled.b1"), undefined);
});

test("growthFacts: sin ninguna meta activa se dice, y una sola vez", () => {
  const facts = growthFacts({ goals: [meta({ status: "Lograda" })], books: [] }, HOY);
  assert.deepStrictEqual(facts.map((f) => f.id), ["growth.no-goals"]);
});

test("growthFacts: todo hecho declara su dominio y un peso entre 0 y 1", () => {
  const facts = growthFacts(
    {
      goals: [meta({ id: "a", keyResults: 0, pct: null }), meta({ id: "b", horizon: "2020-01-01" }), meta({ id: "c", pct: 0 })],
      books: [libro({ lastProgressISO: "2026-01-01" })]
    },
    HOY
  );
  assert.ok(facts.length >= 4);
  for (const f of facts) {
    assert.strictEqual(f.domain, "growth");
    assert.ok(f.weight >= 0 && f.weight <= 1, `peso fuera de rango en ${f.id}: ${f.weight}`);
  }
});

test("growthFacts: los hechos salen ordenados de más a menos anómalo", () => {
  const facts = growthFacts(
    { goals: [meta({ id: "a", keyResults: 0, pct: null }), meta({ id: "b", horizon: "2026-09-05" })], books: [] },
    HOY
  );
  for (let i = 1; i < facts.length; i++) {
    assert.ok((facts[i - 1]?.weight ?? 0) >= (facts[i]?.weight ?? 0));
  }
});
