// tests/domain/insights-habits.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { habitsFacts, type HabitsSnapshot, type HabitFactLike } from "../../src/lib/domain/insights/facts/habits.ts";
import { addDaysISO } from "../../src/lib/domain/datetime.ts";
import type { HabitLogLike } from "../../src/lib/domain/types.ts";

const HOY = "2026-08-23";

function habito(id: string, over: Partial<HabitFactLike> = {}): HabitFactLike {
  return { id, name: `Hábito ${id}`, routineId: "r1", routineFrequency: "Diario", ...over };
}

function snapshot(over: Partial<HabitsSnapshot> = {}): HabitsSnapshot {
  return { habits: [], logs: [], routines: [], routineRuns: [], ...over };
}

/** Registros consecutivos terminando en `hasta` (inclusive), hacia atrás. */
function racha(habitId: string, hasta: string, dias: number): HabitLogLike[] {
  return Array.from({ length: dias }, (_, i) => ({ habitId, date: addDaysISO(hasta, -i) }));
}

test("habitsFacts: sin datos no inventa nada", () => {
  assert.deepStrictEqual(habitsFacts(snapshot(), HOY), []);
});

test("habitsFacts: una racha de tres días rota ayer se reporta", () => {
  // Cadena que termina anteayer; ayer no se marcó.
  const facts = habitsFacts(
    snapshot({ habits: [habito("h1", { name: "Leer" })], logs: racha("h1", addDaysISO(HOY, -2), 5) }),
    HOY
  );
  const rota = facts.find((f) => f.id === "habits.streak-broken.h1");
  assert.ok(rota);
  assert.match(rota.label, /"Leer" venía de 5 días seguidos y ayer se rompió/);
});

test("habitsFacts: romper una cadena de dos días no es un hallazgo, es un martes", () => {
  const facts = habitsFacts(
    snapshot({ habits: [habito("h1")], logs: racha("h1", addDaysISO(HOY, -2), 2) }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id === "habits.streak-broken.h1"), undefined);
});

test("habitsFacts: un hábito aún no marcado HOY está pendiente, no roto", () => {
  // La cadena llega hasta AYER: hoy simplemente no ha tocado todavía.
  const facts = habitsFacts(
    snapshot({ habits: [habito("h1")], logs: racha("h1", addDaysISO(HOY, -1), 10) }),
    HOY
  );
  assert.strictEqual(
    facts.find((f) => f.id === "habits.streak-broken.h1"),
    undefined,
    "no se avisa de una racha que todavía se puede cumplir"
  );
});

test("habitsFacts: cuanto más larga era la cadena perdida, más pesa", () => {
  const pesoDe = (dias: number) =>
    habitsFacts(snapshot({ habits: [habito("h1")], logs: racha("h1", addDaysISO(HOY, -2), dias) }), HOY).find(
      (f) => f.id === "habits.streak-broken.h1"
    )?.weight ?? 0;
  assert.ok(pesoDe(12) > pesoDe(4));
});

test("habitsFacts: un hábito diario cumplido menos de la mitad del mes se reporta", () => {
  // Vivo desde hace 40 días, pero solo 6 cumplimientos en la ventana.
  const logs = [
    { habitId: "h1", date: addDaysISO(HOY, -40) },
    ...Array.from({ length: 6 }, (_, i) => ({ habitId: "h1", date: addDaysISO(HOY, -(i * 3 + 1)) }))
  ];
  const facts = habitsFacts(snapshot({ habits: [habito("h1", { name: "Meditar" })], logs }), HOY);
  const baja = facts.find((f) => f.id === "habits.low-adherence.h1");
  assert.ok(baja);
  assert.match(baja.label, /"Meditar" es diario y se cumplió/);
  assert.match(baja.label, /de los últimos 30 días/);
});

test("habitsFacts: un hábito nuevo NO se juzga por incumplido", () => {
  // Creado hace 3 días: 2 de 30 sería mentir.
  const logs = [
    { habitId: "h1", date: addDaysISO(HOY, -3) },
    { habitId: "h1", date: addDaysISO(HOY, -2) }
  ];
  const facts = habitsFacts(snapshot({ habits: [habito("h1")], logs }), HOY);
  assert.strictEqual(facts.find((f) => f.id === "habits.low-adherence.h1"), undefined);
});

test("no opina sobre un hábito cuya rutina no es diaria", () => {
  // Contar 8 de 30 en un hábito cuya rutina es semanal diría que va fatal
  // cuando va perfecto. La frecuencia la pone la rutina desde 0045.
  const logs = [
    { habitId: "h1", date: addDaysISO(HOY, -40) },
    ...Array.from({ length: 4 }, (_, i) => ({ habitId: "h1", date: addDaysISO(HOY, -(i * 7 + 1)) }))
  ];
  const facts = habitsFacts(snapshot({ habits: [habito("h1", { routineFrequency: "Semanal" })], logs }), HOY);
  assert.strictEqual(facts.filter((f) => f.id.startsWith("habits.low-adherence")).length, 0);
});

test("habitsFacts: una rutina sin ejecutar en más de una semana se reporta", () => {
  const facts = habitsFacts(
    snapshot({
      routines: [{ id: "r1", name: "Mañana Milagrosa", habitCount: 6, occupationId: "o1" }],
      routineRuns: [{ routineId: "r1", date: addDaysISO(HOY, -10) }]
    }),
    HOY
  );
  const abandonada = facts.find((f) => f.id === "habits.routine-abandoned.r1");
  assert.ok(abandonada);
  assert.match(abandonada.label, /"Mañana Milagrosa" \(6 hábitos\) no se ejecuta desde hace 10 días/);
});

test("habitsFacts: una rutina que nunca se ejecutó no está abandonada, no ha empezado", () => {
  const facts = habitsFacts(
    snapshot({ routines: [{ id: "r1", name: "Nueva", habitCount: 3, occupationId: "o1" }] }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id === "habits.routine-abandoned.r1"), undefined);
});

test("habitsFacts: una rutina corrida anteayer sigue viva", () => {
  const facts = habitsFacts(
    snapshot({
      routines: [{ id: "r1", name: "Viva", habitCount: 3, occupationId: "o1" }],
      routineRuns: [{ routineId: "r1", date: addDaysISO(HOY, -2) }]
    }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id === "habits.routine-abandoned.r1"), undefined);
});

test("habitsFacts: la mayoría de rutinas sin bloque horario va en UN hecho agregado", () => {
  // El anclaje lo declara la rutina desde 0045, así que el hecho se mira por
  // rutina y no por hábito: "N de M rutinas", no "N de M hábitos".
  const facts = habitsFacts(
    snapshot({
      routines: [
        { id: "r1", name: "Uno", habitCount: 1, occupationId: null },
        { id: "r2", name: "Dos", habitCount: 1, occupationId: null },
        { id: "r3", name: "Tres", habitCount: 1, occupationId: "o1" }
      ]
    }),
    HOY
  );
  const sinAncla = facts.filter((f) => f.id === "habits.no-anchor");
  assert.strictEqual(sinAncla.length, 1, "uno agregado, no uno por rutina");
  assert.match(sinAncla[0]?.label ?? "", /2 de 3 rutinas no tienen un bloque horario/);
});

test("habitsFacts: una minoría de rutinas sin anclar no se reporta — el usuario ya sabe lo que hace", () => {
  const facts = habitsFacts(
    snapshot({
      routines: [
        { id: "r1", name: "Uno", habitCount: 1, occupationId: null },
        { id: "r2", name: "Dos", habitCount: 1, occupationId: "o1" },
        { id: "r3", name: "Tres", habitCount: 1, occupationId: "o1" },
        { id: "r4", name: "Cuatro", habitCount: 1, occupationId: "o1" }
      ]
    }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id === "habits.no-anchor"), undefined);
});

test("habitsFacts: todas las rutinas ancladas no generan ningún hecho de anclaje", () => {
  // El caso que la versión anterior (a nivel de hábito) no podía distinguir
  // bien: si cada rutina ya tiene su bloque, no hay nada que avisar.
  const facts = habitsFacts(
    snapshot({
      routines: [
        { id: "r1", name: "Uno", habitCount: 1, occupationId: "o1" },
        { id: "r2", name: "Dos", habitCount: 1, occupationId: "o2" }
      ]
    }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id === "habits.no-anchor"), undefined);
});

test("habitsFacts: la falta de ancla nunca desplaza a una racha rota larga", () => {
  const facts = habitsFacts(
    snapshot({
      habits: [habito("h1"), habito("h2", { routineId: "r2" })],
      logs: racha("h1", addDaysISO(HOY, -2), 14),
      routines: [
        { id: "r1", name: "Uno", habitCount: 1, occupationId: null },
        { id: "r2", name: "Dos", habitCount: 1, occupationId: null }
      ]
    }),
    HOY
  );
  assert.strictEqual(facts[0]?.id, "habits.streak-broken.h1", "la racha rota debe ir primero");
});

test("habitsFacts: todo hecho declara su dominio, refs y un peso entre 0 y 1", () => {
  const facts = habitsFacts(
    snapshot({
      habits: [habito("h1"), habito("h2", { routineId: "r2" })],
      logs: racha("h1", addDaysISO(HOY, -2), 6),
      routines: [{ id: "r1", name: "R", habitCount: 2, occupationId: null }],
      routineRuns: [{ routineId: "r1", date: addDaysISO(HOY, -20) }]
    }),
    HOY
  );
  assert.ok(facts.length >= 3);
  for (const f of facts) {
    assert.strictEqual(f.domain, "habits");
    assert.ok(f.weight >= 0 && f.weight <= 1, `peso fuera de rango en ${f.id}: ${f.weight}`);
    assert.ok(f.refs.length > 0, `hecho sin refs: ${f.id}`);
  }
});
