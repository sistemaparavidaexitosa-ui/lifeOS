// tests/domain/graph-quadtree.test.ts
// El árbol que decide qué nodo hay bajo el cursor. Si se equivoca, hacer clic
// selecciona otra cosa, que es de los fallos más desconcertantes que existen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuadtree, type QuadPoint } from "../../src/lib/domain/graph/quadtree.ts";

function rejilla(n: number): QuadPoint[] {
  const p: QuadPoint[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) p.push({ id: `${i}-${j}`, x: i * 10, y: j * 10 });
  }
  return p;
}

test("query devuelve exactamente lo mismo que recorrer todo a mano", () => {
  const puntos = rejilla(20);
  const arbol = buildQuadtree(puntos);
  const rect = { x: 35, y: 45, width: 50, height: 30 };
  const aMano = puntos
    .filter((p) => p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height)
    .map((p) => p.id).sort();
  const delArbol = arbol.query(rect).map((p) => p.id).sort();
  assert.deepStrictEqual(delArbol, aMano);
});

test("nearest encuentra el punto exacto bajo el cursor", () => {
  const arbol = buildQuadtree(rejilla(10));
  assert.strictEqual(arbol.nearest(30, 70, 5)?.id, "3-7");
});

test("nearest con el cursor justo encima no devuelve null", () => {
  // Con `<` en vez de `<=` la distancia cero no entraba y el clic sobre el
  // centro del nodo era el único sitio donde no se podía seleccionar.
  const arbol = buildQuadtree([{ id: "solo", x: 5, y: 5 }]);
  assert.strictEqual(arbol.nearest(5, 5, 0)?.id, "solo");
});

test("nearest respeta el radio: fuera de él no hay nada", () => {
  const arbol = buildQuadtree(rejilla(10));
  assert.strictEqual(arbol.nearest(34, 74, 2), null);
  assert.strictEqual(arbol.nearest(34, 74, 8)?.id, "3-7");
});

test("mil puntos en la MISMA coordenada no desbordan la pila", () => {
  // El caso patológico real: dos tareas creadas a la vez nacen en el mismo
  // sitio hasta que corre el layout. Sin el tope de profundidad, subdividir no
  // los separa nunca y el árbol crece hasta reventar.
  const puntos = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, x: 7, y: 7 }));
  const arbol = buildQuadtree(puntos);
  assert.strictEqual(arbol.size, 1000);
  assert.strictEqual(arbol.query({ x: 6, y: 6, width: 2, height: 2 }).length, 1000);
});

test("un punto con coordenada no finita se descarta en vez de romper el árbol", () => {
  const arbol = buildQuadtree([
    { id: "bueno", x: 1, y: 1 },
    { id: "malo", x: Number.NaN, y: 0 }
  ]);
  assert.strictEqual(arbol.size, 1);
});

test("walk resume un cuadrante entero cuando el visitante se da por satisfecho", () => {
  // Es la base de Barnes-Hut: si el visitante devuelve true, no se baja más.
  const arbol = buildQuadtree(rejilla(8));
  let visitas = 0;
  arbol.walk((_cx, _cy, count, _w, _hoja) => {
    visitas++;
    return count > 1; // resumir todo lo que no sea una hoja de un punto
  });
  assert.strictEqual(visitas, 1, "la raíz sola debería bastar");
});

test("el árbol vacío no explota", () => {
  const arbol = buildQuadtree([]);
  assert.strictEqual(arbol.size, 0);
  assert.deepStrictEqual(arbol.query({ x: 0, y: 0, width: 10, height: 10 }), []);
  assert.strictEqual(arbol.nearest(0, 0, 100), null);
});
