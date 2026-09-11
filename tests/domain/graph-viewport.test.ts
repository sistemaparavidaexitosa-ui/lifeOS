// tests/domain/graph-viewport.test.ts
// La cámara del lienzo. Un signo cambiado aquí no da error: da un grafo que se
// va andando solo al hacer zoom, y eso se depura mirando píxeles durante una
// hora. Con dos números se ve en un segundo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANCHO_ESTRECHO, MAX_FIT_SCALE, MAX_SCALE, MIN_SCALE, boundsOf, clampScale, fitToBounds,
  focusAt, frameFor, panBy, pinch, screenToWorld, visibleWorld, worldToScreen, zoomAt, type Viewport
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

test("fitToBounds NUNCA amplía por encima del tamaño natural", () => {
  // El fallo del teléfono. Con un grafo de un solo nodo el rectángulo tiene
  // área cero, el mínimo de 1 evita la división por cero pero deja una escala
  // de 8x, y un proyecto se dibujaba con 320px de diámetro en un lienzo de
  // 366px. Encuadrar sirve para que QUEPA lo que hay, nunca para agrandarlo.
  const movil: Viewport = { x: 0, y: 0, scale: 1, width: 366, height: 461 };
  for (const b of [
    { x: 0, y: 0, width: 0, height: 0 },
    { x: 0, y: 0, width: 20, height: 0 },
    { x: -5, y: -5, width: 10, height: 10 }
  ]) {
    const v = fitToBounds(movil, b);
    assert.ok(v.scale <= MAX_FIT_SCALE, `${JSON.stringify(b)} dio escala ${v.scale}`);
  }
});

test("fitToBounds sigue REDUCIENDO todo lo que haga falta", () => {
  // El tope es solo por arriba: un grafo enorme tiene que seguir cabiendo.
  const v = fitToBounds(
    { x: 0, y: 0, scale: 1, width: 366, height: 461 },
    { x: 0, y: 0, width: 40000, height: 40000 }
  );
  assert.ok(v.scale < 0.02 + 0.001 && v.scale >= MIN_SCALE);
});

test("focusAt centra un punto sin tocar el zoom", () => {
  // Al elegir un resultado del buscador se recentra, y cambiar el zoom a la vez
  // desorienta: pierdes la referencia de dónde estabas.
  const v: Viewport = { x: 100, y: 100, scale: 2, width: 400, height: 300 };
  const centrada = focusAt(v, { x: 50, y: -20 });
  assert.strictEqual(centrada.scale, 2);
  const centro = screenToWorld(centrada, 200, 150);
  assert.ok(Math.abs(centro.x - 50) < 1e-9);
  assert.ok(Math.abs(centro.y + 20) < 1e-9);
});

test("focusAt con escala explícita la aplica y sigue centrando", () => {
  const v: Viewport = { x: 0, y: 0, scale: 0.03, width: 366, height: 461 };
  const centrada = focusAt(v, { x: 1000, y: 2000 }, 0.5);
  assert.strictEqual(centrada.scale, 0.5);
  const centro = screenToWorld(centrada, 183, 230.5);
  assert.ok(Math.abs(centro.x - 1000) < 1e-9);
  assert.ok(Math.abs(centro.y - 2000) < 1e-9);
});

test("el pellizco deja quieto el punto medio entre los dos dedos", () => {
  // Es la misma propiedad que el zoom con rueda anclado al cursor, y es lo que
  // hace que un pellizco se sienta bien en vez de que el contenido se escape.
  const v: Viewport = { x: 10, y: -30, scale: 0.8, width: 366, height: 461 };
  const a0 = { x: 100, y: 200 };
  const b0 = { x: 200, y: 200 };
  const a1 = { x: 60, y: 200 };
  const b1 = { x: 240, y: 200 };
  const medio0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const antes = screenToWorld(v, medio0.x, medio0.y);
  const despues = screenToWorld(pinch(v, a0, b0, a1, b1), (a1.x + b1.x) / 2, (a1.y + b1.y) / 2);
  assert.ok(Math.abs(antes.x - despues.x) < 1e-9, `x ${antes.x} vs ${despues.x}`);
  assert.ok(Math.abs(antes.y - despues.y) < 1e-9);
});

test("el pellizco separa los dedos = acercarse", () => {
  const v: Viewport = { x: 0, y: 0, scale: 1, width: 366, height: 461 };
  const ampliado = pinch(v, { x: 150, y: 200 }, { x: 250, y: 200 }, { x: 100, y: 200 }, { x: 300, y: 200 });
  assert.ok(ampliado.scale > 1.9 && ampliado.scale < 2.1, `escala ${ampliado.scale}`);
});

test("dos dedos que no se mueven no cambian nada", () => {
  // Apoyar dos dedos sin moverlos daba un salto de escala por redondeo.
  const v: Viewport = { x: 5, y: 5, scale: 1.3, width: 366, height: 461 };
  const a = { x: 100, y: 100 };
  const b = { x: 200, y: 220 };
  const igual = pinch(v, a, b, a, b);
  assert.ok(Math.abs(igual.scale - v.scale) < 1e-9);
  assert.ok(Math.abs(igual.x - v.x) < 1e-9);
  assert.ok(Math.abs(igual.y - v.y) < 1e-9);
});

test("dos dedos juntándose hasta tocarse no divide por cero", () => {
  const v: Viewport = { x: 0, y: 0, scale: 1, width: 366, height: 461 };
  const r = pinch(v, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 100 });
  assert.ok(Number.isFinite(r.scale) && Number.isFinite(r.x) && Number.isFinite(r.y));
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

// ---------------------------------------------------------------------------
// EL ENCUADRE AL ABRIR, QUE ES DONDE SE VIO EL FALLO DEL TELÉFONO
// ---------------------------------------------------------------------------

/** Un proyecto con `n` tareas, colocado por capas. Alto real del dibujo. */
function grafoDe(n: number) {
  const alto = (n - 1) * 72;
  return { bounds: { x: 0, y: -alto / 2, width: 260, height: alto }, raiz: { x: 0, y: 0 } };
}

const MOVIL: Viewport = { x: 0, y: 0, scale: 1, width: 366, height: 461 };
const ESCRITORIO: Viewport = { x: 0, y: 0, scale: 1, width: 1200, height: 700 };
const LEGIBLE = 0.35;

test("en un teléfono, un proyecto grande se abre CON NOMBRES aunque no quepa entero", () => {
  // Antes: 160 tareas en 366px daban escala 0,03 y no se dibujaba una sola
  // etiqueta. Eran puntos de colores mudos, que es el «no se ven los
  // proyectos» que se reportó desde un iPhone.
  for (const n of [25, 60, 160]) {
    const { bounds, raiz } = grafoDe(n);
    const v = frameFor(MOVIL, bounds, raiz, LEGIBLE);
    assert.ok(v.scale >= LEGIBLE, `${n} tareas dio escala ${v.scale}`);
  }
});

test("y queda centrado en la raíz, no en una esquina", () => {
  const { bounds, raiz } = grafoDe(160);
  const v = frameFor(MOVIL, bounds, raiz, LEGIBLE);
  const centro = screenToWorld(v, v.width / 2, v.height / 2);
  assert.ok(Math.abs(centro.x - raiz.x) < 1e-9);
  assert.ok(Math.abs(centro.y - raiz.y) < 1e-9);
});

test("si el grafo pequeño YA cabe legible, se encuadra entero como siempre", () => {
  // El arreglo del teléfono no debe cambiar el caso que funcionaba.
  const { bounds, raiz } = grafoDe(6);
  assert.deepStrictEqual(frameFor(MOVIL, bounds, raiz, LEGIBLE), fitToBounds(MOVIL, bounds));
});

test("en pantalla ancha NUNCA se renuncia a encuadrar", () => {
  // Ahí sí hay sitio: ver el grafo entero es justo lo que se quiere, aunque
  // toque quedarse sin etiquetas.
  const { bounds, raiz } = grafoDe(160);
  assert.deepStrictEqual(frameFor(ESCRITORIO, bounds, raiz, LEGIBLE), fitToBounds(ESCRITORIO, bounds));
  assert.ok(ESCRITORIO.width >= ANCHO_ESTRECHO);
});

test("sin raíz conocida se encuadra igualmente en vez de no hacer nada", () => {
  const { bounds } = grafoDe(160);
  assert.deepStrictEqual(frameFor(MOVIL, bounds, null, LEGIBLE), fitToBounds(MOVIL, bounds));
});
