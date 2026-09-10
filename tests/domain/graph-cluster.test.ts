// tests/domain/graph-cluster.test.ts
// La agrupación. Lo que se defiende aquí es que agrupar NUNCA pierda un nodo:
// un montón que se traga una tarea y no la lista al expandirlo es una tarea
// invisible, y una tarea invisible es peor que no tener grafo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MINIMO_PARA_AGRUPAR, clusterGraph } from "../../src/lib/domain/graph/cluster.ts";
import type { GraphEdge, GraphNode, GraphNodeType } from "../../src/lib/domain/graph/types.ts";

function nodo(id: string, nodeType: GraphNodeType = "task", label = id): GraphNode {
  return { id, label, nodeType, scope: "workspace", entityTable: null, entityId: null, metadata: null, depth: 1 };
}
function arista(sourceId: string, targetId: string, relType: GraphEdge["relType"] = "belongs_to"): GraphEdge {
  return { sourceId, targetId, relType, origin: "system", weight: null, confidence: null };
}

const TAREAS = Array.from({ length: 8 }, (_, i) => nodo(`t${i}`));

test("sin agrupación, salen todos sueltos y no hay montones", () => {
  const r = clusterGraph(TAREAS, [], "none");
  assert.strictEqual(r.nodes.length, 8);
  assert.strictEqual(r.clusters.length, 0);
});

test("agrupar no pierde ni un nodo", () => {
  // La invariante del archivo: sueltos + miembros de montones = todo.
  const r = clusterGraph(TAREAS, [], "type");
  const total = r.nodes.length + r.clusters.reduce((n, c) => n + c.memberIds.length, 0);
  assert.strictEqual(total, TAREAS.length);
});

test("por debajo del mínimo no se agrupa: esconder tres nombres no compensa", () => {
  const pocos = TAREAS.slice(0, MINIMO_PARA_AGRUPAR - 1);
  const r = clusterGraph(pocos, [], "type");
  assert.strictEqual(r.clusters.length, 0);
  assert.strictEqual(r.nodes.length, pocos.length);
});

test("un montón abierto deja de ser un montón", () => {
  const cerrado = clusterGraph(TAREAS, [], "type");
  const clave = cerrado.clusters[0]!.id;
  const abierto = clusterGraph(TAREAS, [], "type", new Set([clave]));
  assert.strictEqual(abierto.clusters.length, 0);
  assert.strictEqual(abierto.nodes.length, 8);
});

test("agrupado por padre, la etiqueta nombra al padre", () => {
  // «12 tareas en «Mudanza»» orienta; «12 tareas» no dice de qué.
  const padre = nodo("p", "project", "Mudanza");
  const hijos = Array.from({ length: 6 }, (_, i) => nodo(`h${i}`));
  const aristas = hijos.map((h) => arista(h.id, "p"));
  const r = clusterGraph([padre, ...hijos], aristas, "parent");
  const montones = r.clusters.filter((c) => c.memberIds.length >= MINIMO_PARA_AGRUPAR);
  assert.strictEqual(montones.length, 1);
  assert.match(montones[0]!.label, /Mudanza/);
});

test("un nodo con DOS padres se queda suelto a propósito", () => {
  // Meterlo en uno de los dos montones al azar escondería una de las dos
  // relaciones, y esa relación es justo lo raro que merece la pena ver.
  const hijos = Array.from({ length: 6 }, (_, i) => nodo(`h${i}`));
  const aristas = [...hijos.map((h) => arista(h.id, "p1")), arista("h0", "p2")];
  const r = clusterGraph([nodo("p1", "project"), nodo("p2", "project"), ...hijos], aristas, "parent");
  const agrupados = new Set(r.clusterOf.keys());
  assert.strictEqual(agrupados.has("h0"), false, "h0 tiene dos padres y no debería agruparse");
});

test("clusterOf apunta de cada miembro a su montón", () => {
  const r = clusterGraph(TAREAS, [], "type");
  for (const c of r.clusters) {
    for (const id of c.memberIds) assert.strictEqual(r.clusterOf.get(id), c.id);
  }
});

test("los tipos distintos no se mezclan en el mismo montón", () => {
  const mezcla = [
    ...Array.from({ length: 6 }, (_, i) => nodo(`t${i}`, "task")),
    ...Array.from({ length: 6 }, (_, i) => nodo(`n${i}`, "note"))
  ];
  const r = clusterGraph(mezcla, [], "type");
  assert.strictEqual(r.clusters.length, 2);
  for (const c of r.clusters) {
    const prefijo = c.memberIds[0]![0];
    assert.ok(c.memberIds.every((id) => id[0] === prefijo), c.label);
  }
});
