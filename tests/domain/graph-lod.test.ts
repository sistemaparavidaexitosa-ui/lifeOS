// tests/domain/graph-lod.test.ts
// Recorte y nivel de detalle: lo que hace que cien mil nodos quepan en un
// fotograma. Si el recorte se pasa de listo, los nodos parpadean en los bordes.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOD_CIRCLE, LOD_LABEL, MAX_ETIQUETAS, cull, cullEdges, degreeOf, detailFor, pickLabels
} from "../../src/lib/domain/graph/lod.ts";

test("detailFor cambia de nivel en los cortes documentados", () => {
  assert.strictEqual(detailFor(1), "label");
  assert.strictEqual(detailFor(LOD_LABEL), "label");
  assert.strictEqual(detailFor(LOD_LABEL - 0.001), "circle");
  assert.strictEqual(detailFor(LOD_CIRCLE), "circle");
  assert.strictEqual(detailFor(LOD_CIRCLE - 0.001), "dot");
});

test("el margen del recorte evita que un nodo desaparezca de golpe en el borde", () => {
  // Sin margen, un nodo cuyo centro está un píxel fuera desaparece aunque su
  // burbuja y su etiqueta todavía asomen. Se nota como un parpadeo al arrastrar.
  const vista = { x: 0, y: 0, width: 100, height: 100 };
  const casi = [{ id: "borde", x: 105, y: 50 }];
  assert.strictEqual(cull(casi, vista, 0).length, 0);
  assert.strictEqual(cull(casi, vista, 20).length, 1);
});

test("cull deja fuera lo que está de verdad fuera", () => {
  const vista = { x: 0, y: 0, width: 100, height: 100 };
  const nodos = [
    { id: "dentro", x: 50, y: 50 },
    { id: "lejos", x: 5000, y: 5000 }
  ];
  assert.deepStrictEqual(cull(nodos, vista, 10).map((n) => n.id), ["dentro"]);
});

test("una arista con UN extremo visible se dibuja", () => {
  // Es la que dice «esto depende de algo que no estás viendo», que es la
  // información más valiosa del lienzo. Exigir los dos extremos la escondería.
  const visibles = new Set(["a"]);
  const aristas = [
    { sourceId: "a", targetId: "fuera" },
    { sourceId: "fuera1", targetId: "fuera2" }
  ];
  assert.deepStrictEqual(cullEdges(aristas, visibles).map((e) => e.targetId), ["fuera"]);
});

test("degreeOf cuenta los dos extremos", () => {
  const g = degreeOf([{ sourceId: "a", targetId: "b" }, { sourceId: "a", targetId: "c" }]);
  assert.strictEqual(g.get("a"), 2);
  assert.strictEqual(g.get("b"), 1);
  assert.strictEqual(g.get("c"), 1);
});

test("con pocos nodos todos llevan etiqueta", () => {
  const nodos = [{ id: "a" }, { id: "b" }];
  assert.strictEqual(pickLabels(nodos, new Map()).size, 2);
});

test("cuando no hay etiquetas para todos, ganan los concentradores", () => {
  // Si hay que elegir, los nombres que orientan son los de los nodos con más
  // cosas colgando. Un nodo hoja sin nombre se entiende por dónde está; un
  // concentrador sin nombre deja la zona muda.
  const nodos = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` }));
  const grados = new Map(nodos.map((n, i) => [n.id, i]));
  const elegidos = pickLabels(nodos, grados, 3);
  assert.deepStrictEqual([...elegidos].sort(), ["n7", "n8", "n9"]);
});

test("pickLabels es estable con grados empatados", () => {
  // Sin el desempate por id, dos fotogramas seguidos enseñan etiquetas
  // distintas y el texto parpadea sin que nada se haya movido.
  const nodos = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}` }));
  const grados = new Map(nodos.map((n) => [n.id, 1]));
  assert.deepStrictEqual([...pickLabels(nodos, grados, 3)], [...pickLabels(nodos, grados, 3)]);
});

test("el tope de etiquetas es el que dice la constante", () => {
  const nodos = Array.from({ length: MAX_ETIQUETAS + 50 }, (_, i) => ({ id: `n${i}` }));
  assert.strictEqual(pickLabels(nodos, new Map()).size, MAX_ETIQUETAS);
});
