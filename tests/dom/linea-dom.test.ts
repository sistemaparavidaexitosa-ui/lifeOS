// tests/dom/linea-dom.test.ts
//
// Las pruebas que faltaban. Seis fallos de este editor pasaron 756 pruebas
// verdes porque NINGUNA tocaba el DOM: el cuerpo se escribía al revés, luego
// no se escribía, y la suite seguía en verde. Esto lo cierra.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  leerDom,
  pintarEnDom,
  offsetDelCursor,
  ponerSeleccion,
  mismoContenido
} from "../../src/lib/dom/linea-dom.ts";
import type { Inline } from "../../src/lib/domain/notes/markup.ts";

function conDom(): { el: HTMLElement; window: Window & typeof globalThis } {
  const dom = new JSDOM("<div id='linea' contenteditable></div>", { pretendToBeVisual: true });
  const w = dom.window as unknown as Window & typeof globalThis;
  // El módulo usa `document` y `window` globales, igual que en el navegador.
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.Node = w.Node;
  const el = w.document.getElementById("linea");
  assert.ok(el);
  return { el: el as HTMLElement, window: w };
}

const texto = (t: string): Inline[] => [{ kind: "text", text: t }];

test("pintarEnDom y leerDom son inversas para todas las marcas", () => {
  const { el } = conDom();
  const content: Inline[] = [
    { kind: "text", text: "hay " },
    { kind: "bold", text: "prisa" },
    { kind: "text", text: ", es " },
    { kind: "italic", text: "urgente" },
    { kind: "text", text: " y " },
    { kind: "underline", text: "sub" },
    { kind: "strike", text: "tach" },
    { kind: "code", text: "npm run build" },
    { kind: "link", text: "aquí", href: "https://ejemplo.com" }
  ];
  pintarEnDom(el, content);
  assert.deepStrictEqual(leerDom(el), content);
});

test("pintarEnDom no deja HTML ajeno: lo pegado colapsa a texto", () => {
  const { el } = conDom();
  // Simula lo que deja el navegador tras pegar desde una web.
  el.innerHTML = '<div style="color:red"><span>ho</span><script>alert(1)</script>la</div>';
  const leido = leerDom(el);
  assert.deepStrictEqual(leido, [{ kind: "text", text: "hola" }]);
  assert.ok(!leido.some((p) => p.kind !== "text"));
});

test("leerDom ignora un href que no sea http(s)", () => {
  const { el } = conDom();
  el.innerHTML = '<a href="javascript:alert(1)">pincha</a>';
  assert.deepStrictEqual(leerDom(el), [{ kind: "text", text: "pincha" }]);
});

test("ponerSeleccion y offsetDelCursor son inversas, también en un tramo", () => {
  const { el } = conDom();
  pintarEnDom(el, [
    { kind: "text", text: "abc" },
    { kind: "bold", text: "def" }
  ]);
  ponerSeleccion(el, 4, 4);
  assert.deepStrictEqual(offsetDelCursor(el), { start: 4, end: 4 });
  ponerSeleccion(el, 1, 5);
  assert.deepStrictEqual(offsetDelCursor(el), { start: 1, end: 5 });
});

test("ponerSeleccion sobre una línea vacía no revienta y deja el cursor al inicio", () => {
  const { el } = conDom();
  pintarEnDom(el, texto(""));
  ponerSeleccion(el, 0, 0);
  assert.deepStrictEqual(offsetDelCursor(el), { start: 0, end: 0 });
});

test("mismoContenido distingue lo que cambió de lo que no", () => {
  assert.strictEqual(mismoContenido(texto("hola"), texto("hola")), true);
  assert.strictEqual(mismoContenido(texto("hola"), texto("hol")), false);
  assert.strictEqual(mismoContenido(texto("a"), [{ kind: "bold", text: "a" }]), false);
  assert.strictEqual(
    mismoContenido(
      [{ kind: "link", text: "a", href: "https://x.com" }],
      [{ kind: "link", text: "a", href: "https://y.com" }]
    ),
    false
  );
});

test("EL FALLO: teclear no debe repintar, o el cursor se pierde y se escribe al revés", () => {
  // Reproduce el bucle real del editor: el navegador inserta, se lee el DOM, el
  // modelo vuelve IGUAL, y sólo se repinta si de verdad cambió algo.
  const { el, window: w } = conDom();
  pintarEnDom(el, texto("hol"));
  ponerSeleccion(el, 3, 3);

  // El navegador inserta la "a" donde está el cursor.
  const nodo = el.firstChild?.firstChild ?? el.firstChild;
  assert.ok(nodo);
  (nodo as Text).textContent = "hola";
  ponerSeleccion(el, 4, 4);

  const leido = leerDom(el);
  assert.deepStrictEqual(leido, texto("hola"));

  // El modelo devuelve lo mismo que acabamos de emitir: NO se repinta.
  assert.strictEqual(mismoContenido(leido, texto("hola")), true);

  // Y el cursor sigue donde lo dejó el usuario, detrás de la "a".
  assert.deepStrictEqual(offsetDelCursor(el), { start: 4, end: 4 });
  assert.strictEqual(el.textContent, "hola");
  void w;
});

test("EL OTRO FALLO: un cambio del MODELO sí repinta y repone la selección", () => {
  // Poner negrita sobre «ol» de «hola»: el contenido cambia de verdad, así que
  // hay que repintar y devolver la selección al mismo tramo.
  const { el } = conDom();
  pintarEnDom(el, texto("hola"));
  ponerSeleccion(el, 1, 3);

  const conNegrita: Inline[] = [
    { kind: "text", text: "h" },
    { kind: "bold", text: "ol" },
    { kind: "text", text: "a" }
  ];
  assert.strictEqual(mismoContenido(leerDom(el), conNegrita), false);

  pintarEnDom(el, conNegrita);
  ponerSeleccion(el, 1, 3);

  assert.strictEqual(el.querySelector("b")?.textContent, "ol");
  assert.deepStrictEqual(offsetDelCursor(el), { start: 1, end: 3 });
  assert.strictEqual(el.textContent, "hola");
});
