// tests/dom/barra-formato.test.ts
//
// Dónde va la barra de formato (D-155). Se ancla a la LÍNEA donde se escribe,
// en coordenadas del contenedor, así que las pruebas no necesitan viewport:
// es justo lo que la hace inmune al teclado del iPhone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { posicionBarra } from "../../src/lib/dom/barra-formato.ts";

test("posicionBarra: va debajo de la línea, con un respiro", () => {
  // Contenedor en y=100 de la pantalla; la línea termina en y=426, 326px dentro.
  assert.strictEqual(posicionBarra({ top: 400, bottom: 426 }, { top: 100 }), 326 + 6);
});

test("posicionBarra: no depende del scroll ni del teclado, sólo de la distancia entre los dos", () => {
  // La misma nota desplazada 250px (scroll, o Safari moviendo la vista con el
  // teclado abierto): las dos cajas se mueven igual y la barra no cambia.
  const quieta = posicionBarra({ top: 400, bottom: 426 }, { top: 100 });
  const movida = posicionBarra({ top: 150, bottom: 176 }, { top: -150 });
  assert.strictEqual(movida, quieta);
});

test("posicionBarra: redondea para no repintar por décimas de píxel", () => {
  assert.strictEqual(Number.isInteger(posicionBarra({ top: 400.4, bottom: 426.4 }, { top: 100.1 })), true);
});
