// tests/dom/anclaje-teclado.test.ts
//
// La aritmética de anclar algo al borde inferior del viewport VISUAL en iOS.
// Los dos fallos que se reportaron —la barra se mueve al hacer scroll, y queda
// debajo del teclado sin verse— salían de mezclar coordenadas: `bottom` se
// mide contra el viewport de LAYOUT, que en iOS no encoge con el teclado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bordeInferiorVisual, ANCLAJE_MINIMO_TECLADO } from "../../src/lib/dom/anclaje-teclado.ts";

test("sin teclado no hay posición que calcular: manda el CSS", () => {
  // Contrato NUEVO. Antes devolvía `innerHeight`, y como en iOS ese valor
  // crece al encogerse la barra de direcciones, la barra se movía al hacer
  // scroll. Devolver null deja el `bottom: 0` del CSS, que no se inmuta.
  assert.strictEqual(bordeInferiorVisual({ innerHeight: 800, vvHeight: 800, vvOffsetTop: 0 }), null);
});

test("con el teclado abierto, el borde sube justo por encima del teclado", () => {
  // 800 de pantalla, 300 de teclado: el viewport visual mide 500 y su borde
  // inferior está en 500. Ahí va la barra, no en 800.
  assert.strictEqual(bordeInferiorVisual({ innerHeight: 800, vvHeight: 500, vvOffsetTop: 0 }), 500);
});

test("EL FALLO DEL SCROLL: al desplazarse, el borde acompaña al viewport visual", () => {
  // Este es el término que quité y por el que la barra derivaba: con el visual
  // desplazado 120px, su borde inferior está en 620 en coordenadas de layout.
  assert.strictEqual(bordeInferiorVisual({ innerHeight: 800, vvHeight: 500, vvOffsetTop: 120 }), 620);
});

test("un teclado más alto que la pantalla no manda la barra fuera", () => {
  const y = bordeInferiorVisual({ innerHeight: 800, vvHeight: 0, vvOffsetTop: 0 });
  assert.notStrictEqual(y, null, "con teclado sí debe calcularse una posición");
  assert.ok(y !== null && y >= 0 && y <= 800, `borde fuera de la pantalla: ${y}`);
});

test("una diferencia de pocos píxeles NO se trata como teclado", () => {
  // La barra de direcciones de Safari aparece y desaparece sola. Sin umbral, la
  // barra de formato daría saltitos constantes sin que haya teclado.
  const sinTeclado = bordeInferiorVisual({
    innerHeight: 800,
    vvHeight: 800 - (ANCLAJE_MINIMO_TECLADO - 1),
    vvOffsetTop: 0
  });
  assert.strictEqual(sinTeclado, null, "por debajo del umbral debe comportarse como si no hubiera teclado");

  const conTeclado = bordeInferiorVisual({
    innerHeight: 800,
    vvHeight: 800 - (ANCLAJE_MINIMO_TECLADO + 1),
    vvOffsetTop: 0
  });
  assert.strictEqual(conTeclado, 800 - (ANCLAJE_MINIMO_TECLADO + 1));
});

test("EL FALLO DEL SCROLL SIN TECLADO: sin teclado no se calcula posición", () => {
  // En iOS `window.innerHeight` crece cuando la barra de direcciones se
  // encoge al hacer scroll. Devolverlo como posición hacía que la barra
  // siguiera ese cambio y «se moviera al hacer scroll». Con null, el
  // componente usa el `bottom: 0` del CSS y no se inmuta.
  assert.strictEqual(bordeInferiorVisual({ innerHeight: 800, vvHeight: 800, vvOffsetTop: 0 }), null);
  assert.strictEqual(bordeInferiorVisual({ innerHeight: 860, vvHeight: 860, vvOffsetTop: 0 }), null);
});
