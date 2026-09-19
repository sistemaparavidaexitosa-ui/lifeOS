// tests/dom/ritual-focus-dom.test.ts
//
// La trampa de foco del arranque guiado. Vive fuera del componente por la misma
// razón que `linea-dom.ts`: `node --experimental-strip-types` no procesa JSX, así
// que nada dentro de un .tsx tiene pruebas, y una trampa de foco rota no se nota
// mirando la pantalla — se nota con el teclado, que es justo lo que nadie prueba
// a mano. El repo no tiene Testing Library y no se añade (D-008).
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { focosDe, atraparFoco, abrirFoco } from "../../src/lib/dom/ritual-focus.ts";

function conDom(html: string): { contenedor: HTMLElement; window: Window & typeof globalThis } {
  const dom = new JSDOM(`<button id="antes">antes</button><div id="ritual">${html}</div>`, { pretendToBeVisual: true });
  const w = dom.window as unknown as Window & typeof globalThis;
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.Node = w.Node;
  globalThis.HTMLElement = w.HTMLElement;
  const el = w.document.getElementById("ritual");
  assert.ok(el);
  return { contenedor: el as HTMLElement, window: w };
}

function tab(window: Window & typeof globalThis, shift = false): KeyboardEvent {
  return new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true });
}

test("focosDe encuentra lo que se puede enfocar, en orden de documento", () => {
  const { contenedor } = conDom(`<button id="a">a</button><a id="b" href="#">b</a><input id="c">`);
  assert.deepStrictEqual(
    focosDe(contenedor).map((e) => e.id),
    ["a", "b", "c"]
  );
});

test("focosDe ignora lo deshabilitado, lo oculto y lo que se sacó del orden de tabulación", () => {
  const { contenedor } = conDom(`
    <button id="a">a</button>
    <button id="no1" disabled>no</button>
    <button id="no2" hidden>no</button>
    <button id="no3" tabindex="-1">no</button>
    <input id="no4" type="hidden">
    <button id="b">b</button>
  `);
  assert.deepStrictEqual(
    focosDe(contenedor).map((e) => e.id),
    ["a", "b"]
  );
});

test("focosDe incluye lo que tiene tabindex positivo aunque no sea un control", () => {
  const { contenedor } = conDom(`<h1 id="titulo" tabindex="0">Buenos días</h1><button id="a">a</button>`);
  assert.deepStrictEqual(
    focosDe(contenedor).map((e) => e.id),
    ["titulo", "a"]
  );
});

test("Tab en el último vuelve al primero, y no deja escapar el foco", () => {
  const { contenedor, window } = conDom(`<button id="a">a</button><button id="b">b</button>`);
  const b = window.document.getElementById("b") as HTMLElement;
  b.focus();

  const ev = tab(window);
  atraparFoco(contenedor, ev);

  assert.strictEqual(window.document.activeElement?.id, "a");
  assert.strictEqual(ev.defaultPrevented, true);
});

test("Shift+Tab en el primero salta al último", () => {
  const { contenedor, window } = conDom(`<button id="a">a</button><button id="b">b</button>`);
  const a = window.document.getElementById("a") as HTMLElement;
  a.focus();

  const ev = tab(window, true);
  atraparFoco(contenedor, ev);

  assert.strictEqual(window.document.activeElement?.id, "b");
  assert.strictEqual(ev.defaultPrevented, true);
});

test("En medio de la lista, Tab lo maneja el navegador y no se estorba", () => {
  const { contenedor, window } = conDom(`<button id="a">a</button><button id="b">b</button><button id="c">c</button>`);
  (window.document.getElementById("b") as HTMLElement).focus();

  const ev = tab(window);
  atraparFoco(contenedor, ev);

  // Ni se mueve el foco a mano ni se cancela: el orden natural ya es correcto.
  assert.strictEqual(window.document.activeElement?.id, "b");
  assert.strictEqual(ev.defaultPrevented, false);
});

test("Una tecla que no es Tab no se toca", () => {
  const { contenedor, window } = conDom(`<button id="a">a</button>`);
  (window.document.getElementById("a") as HTMLElement).focus();
  const ev = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  atraparFoco(contenedor, ev);
  assert.strictEqual(ev.defaultPrevented, false);
});

test("Un contenedor sin nada enfocable no lanza y no cancela la tecla", () => {
  const { contenedor, window } = conDom(`<p>Buenos días</p>`);
  const ev = tab(window);
  assert.doesNotThrow(() => atraparFoco(contenedor, ev));
  assert.strictEqual(ev.defaultPrevented, false);
});

test("Con el foco fuera del overlay, Tab lo devuelve dentro", () => {
  // Pasa de verdad: el overlay monta y el foco sigue en el <body>, o en el
  // botón que había debajo. Sin esto, la primera tabulación se va a la app.
  const { contenedor, window } = conDom(`<button id="a">a</button><button id="b">b</button>`);
  (window.document.getElementById("antes") as HTMLElement).focus();

  const ev = tab(window);
  atraparFoco(contenedor, ev);

  assert.strictEqual(window.document.activeElement?.id, "a");
  assert.strictEqual(ev.defaultPrevented, true);
});

test("abrirFoco lleva el foco dentro y, al cerrar, lo devuelve donde estaba", () => {
  const { contenedor, window } = conDom(`<button id="a">a</button><button id="b">b</button>`);
  const antes = window.document.getElementById("antes") as HTMLElement;
  antes.focus();
  assert.strictEqual(window.document.activeElement?.id, "antes");

  const restaurar = abrirFoco(contenedor);
  assert.strictEqual(window.document.activeElement?.id, "a");

  restaurar();
  assert.strictEqual(window.document.activeElement?.id, "antes");
});

test("abrirFoco prefiere el título marcado con data-ritual-title", () => {
  // El primer elemento enfocable de un overlay suele ser «Ahora no», y empezar
  // ahí le lee a un lector de pantalla la salida antes que el contenido. El
  // título se marca con un atributo y no por su etiqueta: cada paso del ritual
  // decide si su encabezado es un <h1> o un <p> enorme, y el foco no puede
  // depender de esa elección tipográfica.
  const { contenedor, window } = conDom(
    `<button id="salir">Ahora no</button><h1 id="titulo" tabindex="-1" data-ritual-title>Buenos días</h1>`
  );
  abrirFoco(contenedor);
  assert.strictEqual(window.document.activeElement?.id, "titulo");
});

test("Sin título marcado, abrirFoco cae al primer elemento enfocable", () => {
  const { contenedor, window } = conDom(`<button id="salir">Ahora no</button><button id="seguir">Seguir</button>`);
  abrirFoco(contenedor);
  assert.strictEqual(window.document.activeElement?.id, "salir");
});

test("abrirFoco sobre un contenedor vacío no lanza, y restaurar tampoco", () => {
  const { contenedor, window } = conDom(`<p>nada</p>`);
  const antes = window.document.getElementById("antes") as HTMLElement;
  antes.focus();
  let restaurar: () => void = () => {};
  assert.doesNotThrow(() => {
    restaurar = abrirFoco(contenedor);
  });
  assert.doesNotThrow(() => restaurar());
  assert.strictEqual(window.document.activeElement?.id, "antes");
});
