// tests/domain/insights-chains.test.ts
// Los hechos de cadena: lo que convierte «tarea atrasada» en «tarea atrasada que
// toca tu meta». Si algo de aquí se rompe, o se mudan las cadenas o se filtra un
// dominio que el usuario apagó.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chainFacts, raicesDeHechos, MAX_CADENAS, type FilaCadena } from "../../src/lib/domain/insights/facts/chains.ts";
import type { Domain, Fact } from "../../src/lib/domain/insights/types.ts";

const TAREA = "11111111-1111-4111-8111-111111111111";
const PROYECTO = "22222222-2222-4222-8222-222222222222";
const META = "33333333-3333-4333-8333-333333333333";
const TAREA_2 = "44444444-4444-4444-8444-444444444444";
const PROYECTO_2 = "55555555-5555-4555-8555-555555555555";

const DOMINIOS: Record<string, Domain> = { tasks: "execution", projects: "execution", personal_goals: "growth", habits: "habits" };
const dominioDeTabla = (t: string) => DOMINIOS[t] ?? null;

function fact(id: string, weight: number, refs: Fact["refs"], domain: Domain = "execution"): Fact {
  return { id, domain, label: `Hecho ${id}`, weight, refs };
}

const filas: FilaCadena[] = [
  { rootEntityId: TAREA, rootLabel: "Firmar el local", nodeId: "n-proy", parentId: "n-tarea", viaRel: "belongs_to", depth: 1, label: "Abrir la tienda", nodeType: "project", entityTable: "projects", entityId: PROYECTO },
  { rootEntityId: TAREA, rootLabel: "Firmar el local", nodeId: "n-meta", parentId: "n-proy", viaRel: "supports", depth: 2, label: "Ser independiente", nodeType: "goal", entityTable: "personal_goals", entityId: META }
];

test("raicesDeHechos: los uuids de las refs, de los hechos más pesados primero, sin repetir", () => {
  const facts = [
    fact("ligero", 0.2, [{ table: "tasks", id: PROYECTO }]),
    fact("pesado", 0.9, [{ table: "tasks", id: TAREA }, { table: "tasks", id: "no-es-uuid" }]),
    fact("repetido", 0.5, [{ table: "tasks", id: TAREA }])
  ];
  assert.deepStrictEqual(raicesDeHechos(facts), [TAREA, PROYECTO]);
  assert.deepStrictEqual(raicesDeHechos(facts, 1), [TAREA]);
});

test("chainFacts: una tarea atrasada que llega a una meta produce un hecho con el camino, nombrando la raíz", () => {
  const [cadena] = chainFacts({
    facts: [fact("execution.overdue", 0.8, [{ table: "tasks", id: TAREA }])],
    filas,
    autorizados: ["execution", "growth"],
    dominioDeTabla
  });
  assert.equal(cadena.id, `chain.${META}.execution.overdue`);
  assert.equal(cadena.domain, "growth");
  // La raíz se nombra: sin esto, «execution.overdue» solo, sin decir de cuál
  // tarea, es indistinguible de la cadena de cualquier otra tarea atrasada.
  assert.match(cadena.label, /Firmar el local/);
  assert.match(cadena.label, /Ser independiente/);
  assert.match(cadena.label, /Abrir la tienda/);
  assert.ok(cadena.weight > 0 && cadena.weight <= 0.8);
  assert.deepStrictEqual(
    new Set(cadena.refs.map((r) => r.id)),
    new Set([TAREA, PROYECTO, META])
  );
});

test("chainFacts: dos raíces que llegan por el mismo hecho a la misma meta se funden en un solo hecho, cada una con su propio camino", () => {
  const filasDeDosRaices: FilaCadena[] = [
    ...filas,
    { rootEntityId: TAREA_2, rootLabel: "Pagar el alquiler", nodeId: "n-proy2", parentId: "n-tarea2", viaRel: "belongs_to", depth: 1, label: "Mudanza", nodeType: "project", entityTable: "projects", entityId: PROYECTO_2 },
    { rootEntityId: TAREA_2, rootLabel: "Pagar el alquiler", nodeId: "n-meta", parentId: "n-proy2", viaRel: "supports", depth: 2, label: "Ser independiente", nodeType: "goal", entityTable: "personal_goals", entityId: META }
  ];

  const salida = chainFacts({
    facts: [fact("execution.overdue", 0.8, [{ table: "tasks", id: TAREA }, { table: "tasks", id: TAREA_2 }])],
    filas: filasDeDosRaices,
    autorizados: ["execution", "growth"],
    dominioDeTabla
  });

  // Una sola cadena, no dos casi idénticas.
  assert.equal(salida.length, 1);
  const [cadena] = salida;
  assert.equal(cadena.id, `chain.${META}.execution.overdue`);

  // Cada raíz nombrada con SU propio proyecto — nunca el de la otra.
  assert.ok(cadena.label.includes("«Firmar el local» (vía «Abrir la tienda»)"));
  assert.ok(cadena.label.includes("«Pagar el alquiler» (vía «Mudanza»)"));
  assert.match(cadena.label, /tocan la meta «Ser independiente»/);

  // Los refs de las dos raíces y sus caminos, sin duplicar la meta compartida.
  assert.deepStrictEqual(
    new Set(cadena.refs.map((r) => r.id)),
    new Set([TAREA, PROYECTO, TAREA_2, PROYECTO_2, META])
  );
});

test("chainFacts: si un dominio del camino está apagado, la cadena no sale", () => {
  const salida = chainFacts({
    facts: [fact("execution.overdue", 0.8, [{ table: "tasks", id: TAREA }])],
    filas,
    autorizados: ["execution"], // growth apagado: la meta no puede viajar
    dominioDeTabla
  });
  assert.deepStrictEqual(salida, []);
});

test("chainFacts: una tabla sin dominio conocido corta la cadena en vez de adivinar", () => {
  const conPuntero: FilaCadena[] = [
    { ...filas[0], entityTable: "task_files" },
    filas[1]
  ];
  const salida = chainFacts({
    facts: [fact("execution.overdue", 0.8, [{ table: "tasks", id: TAREA }])],
    filas: conPuntero,
    autorizados: ["execution", "growth"],
    dominioDeTabla
  });
  assert.deepStrictEqual(salida, []);
});

test("chainFacts: sin meta al final del camino no hay hecho", () => {
  const salida = chainFacts({
    facts: [fact("execution.overdue", 0.8, [{ table: "tasks", id: TAREA }])],
    filas: [filas[0]],
    autorizados: ["execution", "growth"],
    dominioDeTabla
  });
  assert.deepStrictEqual(salida, []);
});

test("chainFacts: acota a MAX_CADENAS y deja las de más peso", () => {
  const muchas: FilaCadena[] = [];
  const facts: Fact[] = [];
  for (let i = 0; i < MAX_CADENAS + 4; i++) {
    const raiz = `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
    const meta = `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
    facts.push(fact(`f${i}`, i / 20, [{ table: "habits", id: raiz }], "habits"));
    muchas.push({ rootEntityId: raiz, rootLabel: `Raíz ${i}`, nodeId: `m${i}`, parentId: `r${i}`, viaRel: "supports", depth: 1, label: `Meta ${i}`, nodeType: "goal", entityTable: "personal_goals", entityId: meta });
  }
  const salida = chainFacts({ facts, filas: muchas, autorizados: ["habits", "growth"], dominioDeTabla });
  assert.equal(salida.length, MAX_CADENAS);
  assert.ok(salida[0].weight >= salida[salida.length - 1].weight);
});
