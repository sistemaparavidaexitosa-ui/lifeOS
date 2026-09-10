// tests/domain/graph-views.test.ts
// Las siete vistas son datos, no siete pantallas. Estas pruebas defienden esa
// afirmación: si una vista dejara de ser un filtro bien formado, el lienzo
// tendría que empezar a hacer casos especiales, que es lo que este archivo
// existe para impedir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAPH_VIEWS, VIEW_ORDER, isGraphViewId, resolveView } from "../../src/lib/domain/graph/views.ts";

test("hay exactamente siete vistas y el orden las lista todas", () => {
  assert.strictEqual(Object.keys(GRAPH_VIEWS).length, 7);
  assert.deepStrictEqual([...VIEW_ORDER].sort(), Object.keys(GRAPH_VIEWS).sort());
});

test("cada vista se declara a sí misma con su propia clave", () => {
  for (const [clave, vista] of Object.entries(GRAPH_VIEWS)) {
    assert.strictEqual(vista.id, clave, clave);
  }
});

test("las vistas de dinero y personales son PRIVADAS", () => {
  // No es una decisión de esta pantalla: es BR-012. Un nodo privado no se puede
  // enlazar con uno de un espacio, así que una vista que los mezclara saldría
  // siempre partida en dos mitades sin una línea entre ellas.
  assert.strictEqual(GRAPH_VIEWS.money.scope, "user");
  assert.strictEqual(GRAPH_VIEWS.personal.scope, "user");
  assert.strictEqual(GRAPH_VIEWS.project.scope, "workspace");
  assert.strictEqual(GRAPH_VIEWS.workspace.scope, "workspace");
});

test("las vistas donde el orden ES el contenido se pintan por capas", () => {
  assert.strictEqual(GRAPH_VIEWS.project.layout, "layered");
  assert.strictEqual(GRAPH_VIEWS.impact.layout, "layered");
  assert.strictEqual(GRAPH_VIEWS.knowledge.layout, "force");
});

test("ninguna vista pide más profundidad de la que la RPC permite", () => {
  // graph_subgraph topa en 8 y graph_impact en 12. Una vista que pidiera más
  // recibiría menos sin avisar y enseñaría un grafo recortado como si fuera
  // completo.
  for (const vista of Object.values(GRAPH_VIEWS)) {
    assert.ok(vista.depth >= 1 && vista.depth <= 8, `${vista.id} pide ${vista.depth}`);
  }
});

test("un identificador de vista inventado cae en la de proyecto sin romperse", () => {
  // Viene de la barra de direcciones: un enlace viejo o mal copiado es normal
  // y no debe dar pantalla de error. Mismo criterio que library con `?por=`.
  assert.strictEqual(resolveView("no-existe").id, "project");
  assert.strictEqual(resolveView(null).id, "project");
  assert.strictEqual(resolveView(undefined).id, "project");
  assert.strictEqual(resolveView("money").id, "money");
});

test("isGraphViewId no se deja engañar", () => {
  assert.strictEqual(isGraphViewId("impact"), true);
  assert.strictEqual(isGraphViewId("toString"), false);
  assert.strictEqual(isGraphViewId(""), false);
});
