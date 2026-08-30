// tests/domain/insights-time.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { timeFacts, type TimeSnapshot } from "../../src/lib/domain/insights/facts/time.ts";

const VENTANA = { start: "08:00", end: "18:00" }; // 600 min de capacidad

function snapshot(over: Partial<TimeSnapshot> = {}): TimeSnapshot {
  return { window: VENTANA, todayOccupations: [], impactTasks: [], ...over };
}

const occ = (id: string, title: string, start: string, end: string) => ({ id, title, start, end });

test("timeFacts: un día holgado no produce ningún hecho", () => {
  const facts = timeFacts(snapshot({ todayOccupations: [occ("o1", "Junta", "09:00", "10:00")] }));
  assert.deepStrictEqual(facts, []);
});

test("timeFacts: la saturación se reporta desde el 80 %, con el mismo umbral que la pantalla", () => {
  // 480 min ocupados de 600 = 80 %
  const facts = timeFacts(snapshot({ todayOccupations: [occ("o1", "Bloque", "08:00", "16:00")] }));
  const sat = facts.find((f) => f.id === "time.saturation");
  assert.ok(sat, "debería haber hecho de saturación al 80 %");
  assert.match(sat.label, /80 %/);
});

test("timeFacts: por debajo del umbral no se reporta saturación", () => {
  // 420 de 600 = 70 %
  const facts = timeFacts(snapshot({ todayOccupations: [occ("o1", "Bloque", "08:00", "15:00")] }));
  assert.strictEqual(facts.find((f) => f.id === "time.saturation"), undefined);
});

test("timeFacts: las tareas de impacto cuentan como compromiso aunque no estén en la agenda", () => {
  const facts = timeFacts(
    snapshot({
      todayOccupations: [occ("o1", "Junta", "08:00", "12:00")], // 240
      impactTasks: [{ id: "t1", title: "Informe", est: 300 }] // 240+300 = 540/600 = 90 %
    })
  );
  const sat = facts.find((f) => f.id === "time.saturation");
  assert.ok(sat);
  assert.match(sat.label, /90 %/);
  assert.match(sat.label, /300 min de tareas de impacto/);
});

test("timeFacts: el peso de la saturación crece con el porcentaje", () => {
  const pesoDe = (end: string) =>
    timeFacts(snapshot({ todayOccupations: [occ("o1", "B", "08:00", end)] })).find((f) => f.id === "time.saturation")
      ?.weight ?? 0;
  assert.ok(pesoDe("18:00") > pesoDe("16:00"), "un día al 100 % debe pesar más que uno al 80 %");
});

test("timeFacts: dos ocupaciones encimadas producen un hecho de traslape con sus minutos", () => {
  const facts = timeFacts(
    snapshot({ todayOccupations: [occ("o1", "Junta", "09:00", "11:00"), occ("o2", "Comida", "10:30", "12:00")] })
  );
  const overlap = facts.find((f) => f.id === "time.overlap.o1.o2");
  assert.ok(overlap);
  assert.match(overlap.label, /se traslapan 30 min/);
  assert.deepStrictEqual(overlap.refs, [
    { table: "occupations", id: "o1" },
    { table: "occupations", id: "o2" }
  ]);
});

test("timeFacts: ocupaciones consecutivas NO se consideran traslape", () => {
  const facts = timeFacts(
    snapshot({ todayOccupations: [occ("o1", "A", "09:00", "10:00"), occ("o2", "B", "10:00", "11:00")] })
  );
  assert.strictEqual(facts.filter((f) => f.id.startsWith("time.overlap")).length, 0);
});

test("timeFacts: una tarea de impacto que no cabe en ningún hueco continuo se reporta", () => {
  // Huecos: 08:00-09:00 (60) y 10:00-18:00 (480)... hay que picarlos más.
  const facts = timeFacts(
    snapshot({
      todayOccupations: [occ("o1", "A", "09:00", "10:00"), occ("o2", "B", "11:00", "12:00"), occ("o3", "C", "13:00", "14:00")],
      impactTasks: [{ id: "t1", title: "Bloque profundo", est: 300 }]
    })
  );
  const noSlot = facts.find((f) => f.id === "time.impact-no-slot.t1");
  assert.ok(noSlot, "el hueco más largo es de 240 min y la tarea pide 300");
  assert.match(noSlot.label, /necesita 300 min seguidos/);
  assert.match(noSlot.label, /240 min/);
});

test("timeFacts: un día poco lleno pero picado delata lo que la suma no ve", () => {
  // 180 min ocupados de 600 (30 %): sin saturación, pero ningún hueco de 150.
  const facts = timeFacts(
    snapshot({
      todayOccupations: [occ("o1", "A", "10:00", "11:00"), occ("o2", "B", "13:00", "14:00"), occ("o3", "C", "16:00", "17:00")],
      impactTasks: [{ id: "t1", title: "Profundo", est: 150 }]
    })
  );
  assert.strictEqual(facts.find((f) => f.id === "time.saturation"), undefined, "no debe haber saturación");
  assert.ok(facts.find((f) => f.id === "time.impact-no-slot.t1"), "pero sí debe verse que no cabe");
});

test("timeFacts: solo se reporta la mayor de las tareas que no caben, y se dice cuántas son", () => {
  const facts = timeFacts(
    snapshot({
      todayOccupations: [occ("o1", "A", "09:00", "10:00"), occ("o2", "B", "11:00", "12:00"), occ("o3", "C", "13:00", "14:00")],
      impactTasks: [
        { id: "t1", title: "Mediana", est: 260 },
        { id: "t2", title: "Grande", est: 400 }
      ]
    })
  );
  const noSlot = facts.filter((f) => f.id.startsWith("time.impact-no-slot"));
  assert.strictEqual(noSlot.length, 1, "un solo hecho, no uno por tarea");
  assert.strictEqual(noSlot[0]?.id, "time.impact-no-slot.t2");
  assert.match(noSlot[0]?.label ?? "", /2 tareas de impacto en la misma situación/);
});

test("timeFacts: los hechos salen ordenados de más a menos anómalo", () => {
  const facts = timeFacts(
    snapshot({
      todayOccupations: [occ("o1", "A", "08:00", "17:00"), occ("o2", "B", "16:00", "18:00")],
      impactTasks: [{ id: "t1", title: "X", est: 200 }]
    })
  );
  for (let i = 1; i < facts.length; i++) {
    assert.ok((facts[i - 1]?.weight ?? 0) >= (facts[i]?.weight ?? 0), "los pesos deben ir de mayor a menor");
  }
});

test("timeFacts: todo hecho de tiempo declara su dominio y un peso entre 0 y 1", () => {
  const facts = timeFacts(
    snapshot({
      todayOccupations: [occ("o1", "A", "08:00", "17:00"), occ("o2", "B", "16:00", "18:00")],
      impactTasks: [{ id: "t1", title: "X", est: 400 }]
    })
  );
  assert.ok(facts.length > 0);
  for (const f of facts) {
    assert.strictEqual(f.domain, "time");
    assert.ok(f.weight >= 0 && f.weight <= 1, `peso fuera de rango en ${f.id}: ${f.weight}`);
    assert.ok(f.refs.length > 0, `hecho sin refs: ${f.id}`);
  }
});

test("timeFacts: sin ventana útil no revienta ni inventa saturación", () => {
  const facts = timeFacts({ window: { start: "08:00", end: "08:00" }, todayOccupations: [], impactTasks: [] });
  assert.deepStrictEqual(facts, []);
});
