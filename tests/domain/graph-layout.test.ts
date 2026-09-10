// tests/domain/graph-layout.test.ts
// El auto-layout. Lo que se prueba aquí no es que quede bonito —eso no se
// puede afirmar con un assert— sino las tres propiedades de las que depende que
// la pantalla sea usable: que sea DETERMINISTA (mismo grafo, mismo dibujo),
// que no escupa NaN, y que las capas ordenen de verdad por profundidad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSimulation, forceLayout, layeredLayout, seedOf } from "../../src/lib/domain/graph/layout.ts";

const NODOS = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}` }));
const ARISTAS = Array.from({ length: 29 }, (_, i) => ({ sourceId: `n${i}`, targetId: `n${i + 1}` }));

test("el mismo grafo se coloca igual dos veces", () => {
  // Sin esto, abrir la pantalla dos veces da dos dibujos distintos y se pierde
  // la memoria visual («mi proyecto grande estaba arriba a la izquierda»).
  const a = forceLayout(NODOS, ARISTAS, { iterations: 40 });
  const b = forceLayout(NODOS, ARISTAS, { iterations: 40 });
  for (const n of NODOS) {
    assert.deepStrictEqual(a.get(n.id), b.get(n.id), n.id);
  }
});

test("dos grafos distintos no comparten semilla", () => {
  assert.notStrictEqual(seedOf([{ id: "a" }]), seedOf([{ id: "b" }]));
  assert.strictEqual(seedOf([{ id: "a" }, { id: "b" }]), seedOf([{ id: "a" }, { id: "b" }]));
});

test("ninguna posición sale NaN ni infinita", () => {
  const pos = forceLayout(NODOS, ARISTAS, { iterations: 120 });
  for (const [id, p] of pos) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${id} -> ${JSON.stringify(p)}`);
  }
});

test("nodos que empiezan encima se separan en vez de dividir por cero", () => {
  // Cinco nodos sin ninguna arista y con el mismo índice inicial: la dirección
  // de la repulsión sale de una división por cero si no hay ruido con semilla.
  const nodos = Array.from({ length: 5 }, (_, i) => ({ id: `x${i}` }));
  const pos = forceLayout(nodos, [], { iterations: 100 });
  const puntos = [...pos.values()];
  for (const p of puntos) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  const distintos = new Set(puntos.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  assert.ok(distintos.size > 1, "acabaron todos en el mismo sitio");
});

test("lo conectado acaba más junto que lo desconectado", () => {
  // La única afirmación sobre el RESULTADO que se puede hacer sin mirar: dos
  // nodos unidos por una arista terminan más cerca que dos que no lo están.
  const nodos = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const pos = forceLayout(nodos, [{ sourceId: "a", targetId: "b" }], { iterations: 300 });
  const d = (p: string, q: string) => {
    const u = pos.get(p)!, v = pos.get(q)!;
    return Math.hypot(u.x - v.x, u.y - v.y);
  };
  assert.ok(d("a", "b") < d("c", "d"), `unidos ${d("a", "b")} vs sueltos ${d("c", "d")}`);
});

test("un nodo fijado no se mueve mientras lo arrastran", () => {
  const sim = createSimulation(NODOS, ARISTAS);
  sim.pin("n5", { x: 999, y: -999 });
  for (let i = 0; i < 30; i++) sim.tick();
  assert.deepStrictEqual(sim.positions().get("n5"), { x: 999, y: -999 });
  sim.pin("n5", null);
  for (let i = 0; i < 30; i++) sim.tick();
  assert.notDeepStrictEqual(sim.positions().get("n5"), { x: 999, y: -999 });
});

test("la simulación se enfría y acaba parando", () => {
  const sim = createSimulation(NODOS, ARISTAS, { iterations: 60 });
  let alpha = 1;
  for (let i = 0; i < 2000 && alpha > 0; i++) alpha = sim.tick();
  assert.strictEqual(alpha, 0, "nunca dejó de moverse");
});

test("una arista hacia un nodo que no está no rompe nada", () => {
  // Pasa de verdad al expandir desde el borde de un subgrafo: llega una arista
  // cuyo otro extremo todavía no se ha cargado.
  const pos = forceLayout([{ id: "a" }], [{ sourceId: "a", targetId: "fantasma" }], { iterations: 10 });
  assert.ok(Number.isFinite(pos.get("a")!.x));
});

test("layeredLayout pone cada profundidad en su columna", () => {
  const pos = layeredLayout([
    { id: "r", depth: 0, label: "Raíz" },
    { id: "a", depth: 1, label: "Alfa" },
    { id: "b", depth: 1, label: "Beta" },
    { id: "z", depth: 2, label: "Zeta" }
  ], { columnWidth: 100 });
  assert.strictEqual(pos.get("r")!.x, 0);
  assert.strictEqual(pos.get("a")!.x, 100);
  assert.strictEqual(pos.get("b")!.x, 100);
  assert.strictEqual(pos.get("z")!.x, 200);
});

test("layeredLayout ordena por etiqueta, no por orden de llegada", () => {
  // Así añadir una tarea no baraja las demás: el dibujo de ayer sigue siendo
  // reconocible mañana.
  const entrada = [
    { id: "2", depth: 1, label: "Zeta" },
    { id: "1", depth: 1, label: "Alfa" }
  ];
  const pos = layeredLayout(entrada);
  assert.ok(pos.get("1")!.y < pos.get("2")!.y, "Alfa debería ir encima de Zeta");
});
