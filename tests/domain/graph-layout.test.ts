// tests/domain/graph-layout.test.ts
// El auto-layout. Lo que se prueba aquí no es que quede bonito —eso no se
// puede afirmar con un assert— sino las tres propiedades de las que depende que
// la pantalla sea usable: que sea DETERMINISTA (mismo grafo, mismo dibujo),
// que no escupa NaN, y que las capas ordenen de verdad por profundidad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSimulation, forceLayout, seedOf, treeLayout } from "../../src/lib/domain/graph/layout.ts";

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

// ---------------------------------------------------------------------------
// EL LAYOUT POR CAPAS, AHORA EN ÁRBOL
//
// Antes ponía TODOS los nodos de una profundidad en una columna ordenados por
// etiqueta. Con 7 proyectos y 74 tareas eso son dos columnas donde las tareas
// de «Tiktok» y las de «Punto de Venta» quedan intercaladas por casualidad
// alfabética: no se puede saber de quién cuelga nada, que es justo lo único que
// un mapa de dependencias tiene que decir.
// ---------------------------------------------------------------------------

/** Espacio → 2 proyectos → 2 tareas cada uno. El caso que se reportó, en pequeño. */
const ARBOL = {
  nodes: [
    { id: "ws", depth: 0, label: "Mi espacio" },
    { id: "pA", depth: 1, label: "Alfa" },
    { id: "pZ", depth: 1, label: "Zeta" },
    { id: "a1", depth: 2, label: "Tarea de Alfa 1" },
    { id: "a2", depth: 2, label: "Tarea de Alfa 2" },
    { id: "z1", depth: 2, label: "Aaa tarea de Zeta" },
    { id: "z2", depth: 2, label: "Bbb tarea de Zeta" }
  ],
  edges: [
    { sourceId: "pA", targetId: "ws" },
    { sourceId: "pZ", targetId: "ws" },
    { sourceId: "a1", targetId: "pA" },
    { sourceId: "a2", targetId: "pA" },
    { sourceId: "z1", targetId: "pZ" },
    { sourceId: "z2", targetId: "pZ" }
  ]
};

test("cada profundidad sigue teniendo su columna", () => {
  const pos = treeLayout(ARBOL.nodes, ARBOL.edges, { columnWidth: 100 });
  assert.strictEqual(pos.get("ws")!.x, 0);
  assert.strictEqual(pos.get("pA")!.x, 100);
  assert.strictEqual(pos.get("a1")!.x, 200);
});

test("las tareas de un proyecto NO se intercalan con las de otro", () => {
  // Es la razón de ser de este layout. Con orden alfabético global, «Aaa tarea
  // de Zeta» se colaba entre las dos de Alfa y el dibujo dejaba de significar
  // nada.
  const pos = treeLayout(ARBOL.nodes, ARBOL.edges);
  const deAlfa = ["a1", "a2"].map((id) => pos.get(id)!.y).sort((x, y) => x - y);
  const deZeta = ["z1", "z2"].map((id) => pos.get(id)!.y).sort((x, y) => x - y);
  const alfaMax = deAlfa[deAlfa.length - 1]!;
  const zetaMin = deZeta[0]!;
  assert.ok(alfaMax < zetaMin, `Alfa acaba en ${alfaMax} y Zeta empieza en ${zetaMin}`);
});

test("un proyecto queda centrado sobre sus tareas", () => {
  // Así la flecha sale del medio del bloque y se ve de un vistazo qué cuelga de
  // qué, sin tener que seguir la línea.
  const pos = treeLayout(ARBOL.nodes, ARBOL.edges);
  const medioAlfa = (pos.get("a1")!.y + pos.get("a2")!.y) / 2;
  assert.ok(Math.abs(pos.get("pA")!.y - medioAlfa) < 1e-9);
});

test("y el espacio queda centrado sobre sus proyectos", () => {
  const pos = treeLayout(ARBOL.nodes, ARBOL.edges);
  const medio = (pos.get("pA")!.y + pos.get("pZ")!.y) / 2;
  assert.ok(Math.abs(pos.get("ws")!.y - medio) < 1e-9);
});

test("hay un hueco entre bloques hermanos, no solo una fila más", () => {
  // Sin separación extra, dos proyectos seguidos se leen como una lista
  // continua de tareas y se pierde justo lo que este layout va a enseñar.
  const pos = treeLayout(ARBOL.nodes, ARBOL.edges, { rowHeight: 10, groupGap: 40 });
  const saltoDentro = Math.abs(pos.get("a2")!.y - pos.get("a1")!.y);
  const saltoEntre = Math.abs(pos.get("z1")!.y - pos.get("a2")!.y);
  assert.ok(saltoEntre > saltoDentro, `dentro ${saltoDentro} vs entre ${saltoEntre}`);
});

test("es determinista: el mismo árbol se coloca igual dos veces", () => {
  assert.deepStrictEqual(
    [...treeLayout(ARBOL.nodes, ARBOL.edges)],
    [...treeLayout(ARBOL.nodes, ARBOL.edges)]
  );
});

test("el orden de los hermanos sale de la etiqueta, no de cómo llegaron", () => {
  // Añadir una tarea no debe barajar las demás.
  const alReves = { ...ARBOL, nodes: [...ARBOL.nodes].reverse() };
  assert.deepStrictEqual(
    [...treeLayout(ARBOL.nodes, ARBOL.edges)].sort(),
    [...treeLayout(alReves.nodes, alReves.edges)].sort()
  );
});

test("un nodo sin padre en la capa anterior se coloca igual, no se pierde", () => {
  // Pasa al expandir desde un borde: llega una tarea cuyo proyecto todavía no
  // se ha cargado. Perderla sería peor que enseñarla suelta.
  const pos = treeLayout(
    [...ARBOL.nodes, { id: "huerfana", depth: 2, label: "Sin proyecto" }],
    ARBOL.edges
  );
  assert.ok(pos.has("huerfana"));
  assert.ok(Number.isFinite(pos.get("huerfana")!.y));
});

test("un nodo con DOS padres aparece una sola vez", () => {
  const pos = treeLayout(ARBOL.nodes, [...ARBOL.edges, { sourceId: "a1", targetId: "pZ" }]);
  assert.strictEqual(pos.size, ARBOL.nodes.length);
  assert.ok(Number.isFinite(pos.get("a1")!.y));
});

test("un ciclo heredado del dominio no cuelga el layout", () => {
  // Las aristas 'system' no se comprueban contra ciclos (D-121), así que el
  // layout tiene que sobrevivir a uno.
  const pos = treeLayout(ARBOL.nodes, [...ARBOL.edges, { sourceId: "ws", targetId: "a1" }]);
  assert.strictEqual(pos.size, ARBOL.nodes.length);
});

test("sin aristas se comporta como una simple lista por capas", () => {
  const pos = treeLayout(
    [{ id: "a", depth: 0, label: "A" }, { id: "b", depth: 0, label: "B" }],
    [],
    { rowHeight: 10 }
  );
  assert.strictEqual(pos.get("a")!.x, pos.get("b")!.x);
  assert.notStrictEqual(pos.get("a")!.y, pos.get("b")!.y);
});
