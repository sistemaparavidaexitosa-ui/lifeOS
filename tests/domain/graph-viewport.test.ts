// tests/domain/graph-viewport.test.ts
// La cámara del lienzo. Un signo cambiado aquí no da error: da un grafo que se
// va andando solo al hacer zoom, y eso se depura mirando píxeles durante una
// hora. Con dos números se ve en un segundo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SCALE, MIN_SCALE, boundsOf, clampScale, fitToBounds, panBy,
  screenToWorld, visibleWorld, worldToScreen, zoomAt, type Viewport
} from "../../src/lib/domain/graph/viewport.ts";

function vista(over: Partial<Viewport> = {}): Viewport {
  return { x: 0, y: 0, scale: 1, width: 800, height: 600, ...over };
}

test("worldToScreen y screenToWorld son inversas exactas", () => {
  const v = vista({ x: -120.5, y: 37.25, scale: 2.5 });
  for (const p of [{ x: 0, y: 0 }, { x: 1000, y: -1000 }, { x: -3.5, y: 0.25 }]) {
    const s = worldToScreen(v, p.x, p.y);
    const w = screenToWorld(v, s.x, s.y);
    assert.ok(Math.abs(w.x - p.x) < 1e-9, `x de ${JSON.stringify(p)}`);
    assert.ok(Math.abs(w.y - p.y) < 1e-9, `y de ${JSON.stringify(p)}`);
  }
});

test("el zoom deja quieto el punto que está bajo el cursor", () => {
  // Es LA propiedad del zoom anclado. Si falla, la rueda del ratón aleja de la
  // vista justo lo que estabas mirando y hay que recolocar a mano cada vez.
  const v = vista({ x: 40, y: -10, scale: 0.8 });
  const cursor = { x: 613, y: 122 };
  const antes = screenToWorld(v, cursor.x, cursor.y);
  const despues = screenToWorld(zoomAt(v, cursor.x, cursor.y, 1.4), cursor.x, cursor.y);
  assert.ok(Math.abs(antes.x - despues.x) < 1e-9);
  assert.ok(Math.abs(antes.y - despues.y) < 1e-9);
});

test("el zoom repetido contra el tope no desplaza la cámara", () => {
  // Cada rueda contra el tope recalculaba el anclaje y metía un error de
  // redondeo: el lienzo se iba solo si insistías con la rueda al máximo.
  let v = vista({ scale: MAX_SCALE });
  const inicial = { ...v };
  for (let i = 0; i < 50; i++) v = zoomAt(v, 400, 300, 2);
  assert.deepStrictEqual(v, inicial);
});

test("arrastrar mueve lo mismo en pantalla a cualquier zoom", () => {
  // Cien píxeles de arrastre son cien píxeles de movimiento, se esté al 5% o
  // al 400%. Es lo que hace que el lienzo se sienta como papel.
  for (const scale of [0.05, 1, 4]) {
    const v = vista({ scale });
    const movido = panBy(v, 100, -60);
    const a = worldToScreen(v, 0, 0);
    const b = worldToScreen(movido, 0, 0);
    assert.ok(Math.abs(b.x - a.x - 100) < 1e-9, `scale ${scale}`);
    assert.ok(Math.abs(b.y - a.y + 60) < 1e-9, `scale ${scale}`);
  }
});

test("clampScale respeta los topes y sobrevive a un NaN", () => {
  assert.strictEqual(clampScale(1000), MAX_SCALE);
  assert.strictEqual(clampScale(0), MIN_SCALE);
  assert.strictEqual(clampScale(Number.NaN), 1);
});

test("fitToBounds no manda la cámara al infinito con un solo nodo", () => {
  // Un grafo de un nodo tiene un rectángulo de área cero. Sin el mínimo de 1,
  // la división da Infinity y la pantalla se queda en blanco sin error.
  const v = fitToBounds(vista(), { x: 10, y: 10, width: 0, height: 0 });
  assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.scale));
  const centro = screenToWorld(v, 400, 300);
  assert.ok(Math.abs(centro.x - 10) < 1e-6);
  assert.ok(Math.abs(centro.y - 10) < 1e-6);
});

test("fitToBounds centra y deja el contenido dentro con su margen", () => {
  const b = { x: -500, y: -250, width: 1000, height: 500 };
  const v = fitToBounds(vista(), b, 50);
  const visible = visibleWorld(v);
  assert.ok(visible.x <= b.x, "asoma por la izquierda");
  assert.ok(visible.y <= b.y, "asoma por arriba");
  assert.ok(visible.x + visible.width >= b.x + b.width, "asoma por la derecha");
  assert.ok(visible.y + visible.height >= b.y + b.height, "asoma por abajo");
});

test("boundsOf devuelve null sin puntos y encierra todos los que hay", () => {
  assert.strictEqual(boundsOf([]), null);
  const b = boundsOf([{ x: -5, y: 2 }, { x: 10, y: -3 }, { x: 0, y: 0 }]);
  assert.deepStrictEqual(b, { x: -5, y: -3, width: 15, height: 5 });
});
