// tests/domain/graph-impact.test.ts
// El informe de impacto: traducir las filas de graph_impact a las seis
// respuestas que la pantalla promete. Es la parte del módulo donde una
// respuesta equivocada tiene consecuencias reales —alguien decide mover una
// fecha porque esto le dijo que no rompía nada—.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImpactReport, countByType, criticalPath, type ImpactRow } from "../../src/lib/domain/graph/impact.ts";

function fila(over: Partial<ImpactRow> & { nodeId: string; depth: number }): ImpactRow {
  return {
    parentId: null, viaRel: "depends_on", label: over.nodeId, nodeType: "task",
    entityTable: "tasks", entityId: over.nodeId, ...over
  };
}

const CADENA: ImpactRow[] = [
  fila({ nodeId: "a", depth: 1, parentId: null, label: "Alfa" }),
  fila({ nodeId: "b", depth: 2, parentId: "a", label: "Beta" }),
  fila({ nodeId: "c", depth: 3, parentId: "b", label: "Gamma" }),
  fila({ nodeId: "suelto", depth: 1, parentId: null, label: "Suelto" })
];

test("separa lo directo de lo indirecto", () => {
  const r = buildImpactReport(CADENA);
  assert.deepStrictEqual(r.direct.map((x) => x.nodeId).sort(), ["a", "suelto"]);
  assert.deepStrictEqual(r.indirect.map((x) => x.nodeId).sort(), ["b", "c"]);
  assert.strictEqual(r.maxDepth, 3);
  assert.strictEqual(r.total, 4);
});

test("«qué se rompe» no incluye lo que solo está DENTRO de algo", () => {
  // Que una tarea pertenezca a un proyecto no significa que cambiar el
  // proyecto la rompa. Si belongs_to contara, cualquier proyecto «rompería»
  // sus doscientas tareas y el aviso dejaría de significar nada.
  const r = buildImpactReport([
    fila({ nodeId: "dep", depth: 1, viaRel: "depends_on" }),
    fila({ nodeId: "hijo", depth: 1, viaRel: "belongs_to" }),
    fila({ nodeId: "sub", depth: 1, viaRel: "child_of" }),
    fila({ nodeId: "bloq", depth: 1, viaRel: "blocks" })
  ]);
  assert.deepStrictEqual(r.breaking.map((x) => x.nodeId).sort(), ["bloq", "dep"]);
});

test("el camino crítico va de la raíz al nodo más profundo", () => {
  assert.deepStrictEqual(criticalPath(CADENA).map((x) => x.nodeId), ["a", "b", "c"]);
});

test("el camino crítico es estable cuando hay empate de profundidad", () => {
  // Sin desempate, abrir el mismo nodo dos veces enseñaría dos caminos
  // distintos y la pantalla parecería estropeada.
  const empatados = [
    fila({ nodeId: "z", depth: 2, parentId: "a", label: "Zeta" }),
    fila({ nodeId: "m", depth: 2, parentId: "a", label: "Mu" }),
    fila({ nodeId: "a", depth: 1, label: "Alfa" })
  ];
  assert.deepStrictEqual(criticalPath(empatados), criticalPath(empatados));
  assert.deepStrictEqual(criticalPath(empatados).map((x) => x.label), ["Alfa", "Mu"]);
});

test("un ciclo heredado del dominio no cuelga la pantalla", () => {
  // Las aristas 'system' NO se comprueban contra ciclos en la base (0054 §8):
  // el grafo tiene que poder MOSTRAR un ciclo que ya existía en tasks.deps.
  // Aquí es donde eso deja de ser un bucle infinito.
  const ciclo = [
    fila({ nodeId: "a", depth: 1, parentId: "b" }),
    fila({ nodeId: "b", depth: 2, parentId: "a" })
  ];
  const camino = criticalPath(ciclo);
  assert.ok(camino.length <= 2, `el camino dio ${camino.length} pasos`);
});

test("sin filas, el informe dice cero y no null", () => {
  const r = buildImpactReport([]);
  assert.deepStrictEqual(r.criticalPath, []);
  assert.strictEqual(r.maxDepth, 0);
  assert.strictEqual(r.total, 0);
  assert.strictEqual(r.truncated, false);
});

test("el recorte se propaga al informe", () => {
  // Un grafo recortado en silencio es peor que uno vacío: parece completo.
  assert.strictEqual(buildImpactReport(CADENA, true).truncated, true);
});

test("countByType ordena por cantidad y desempata estable", () => {
  const r = countByType([
    fila({ nodeId: "1", depth: 1, nodeType: "task" }),
    fila({ nodeId: "2", depth: 1, nodeType: "task" }),
    fila({ nodeId: "3", depth: 1, nodeType: "note" }),
    fila({ nodeId: "4", depth: 1, nodeType: "document" })
  ]);
  assert.deepStrictEqual(r, [
    { nodeType: "task", count: 2 },
    { nodeType: "document", count: 1 },
    { nodeType: "note", count: 1 }
  ]);
});
