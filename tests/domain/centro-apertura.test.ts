// tests/domain/centro-apertura.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { debeAbrirseElCentro, esModoNavegacion, matutinoInicial, vistaInicial } from "../../src/lib/domain/centro/apertura.ts";

// Cuándo se abre el centro solo (D-166). Son tres condiciones y las tres
// importan: el modo, que sea el principio de una visita, y que la visita haya
// empezado por la puerta de la casa.

test("Premium, principio de visita y en Home: se abre", () => {
  assert.strictEqual(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: true, ruta: "/home" }), true);
});

test("La raíz cuenta como Home: abrir la app a secas redirige ahí", () => {
  assert.strictEqual(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: true, ruta: "/" }), true);
});

test("Un enlace directo no se tapa", () => {
  // Una notificación que abre una tarea tiene que llevar a la tarea.
  assert.strictEqual(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: true, ruta: "/execution" }), false);
  assert.strictEqual(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: true, ruta: "/money" }), false);
});

test("A mitad de una visita no se abre solo", () => {
  // Volver a Home navegando no es empezar una visita: interrumpiría.
  assert.strictEqual(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: false, ruta: "/home" }), false);
});

test("En modo habitual no se abre nunca", () => {
  assert.strictEqual(debeAbrirseElCentro({ modo: "habitual", inicioDeVisita: true, ruta: "/home" }), false);
  assert.strictEqual(debeAbrirseElCentro({ modo: "habitual", inicioDeVisita: true, ruta: "/" }), false);
});

test("Una ruta de Home con barra final o con query sigue siendo Home", () => {
  assert.strictEqual(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: true, ruta: "/home/" }), true);
});

test("esModoNavegacion acepta los dos modos y rechaza lo demás", () => {
  assert.strictEqual(esModoNavegacion("premium"), true);
  assert.strictEqual(esModoNavegacion("habitual"), true);
  assert.strictEqual(esModoNavegacion("otro"), false);
  assert.strictEqual(esModoNavegacion(null), false);
  assert.strictEqual(esModoNavegacion(undefined), false);
});

// T3: con el agente encendido, un arranque que se iba a mostrar abre el
// Centro (con la rutina por delante) en vez del overlay viejo.

test("vistaInicial: hay arranque y agente encendido → centro, no ritual", () => {
  assert.strictEqual(vistaInicial({ hayArranque: true, abrirCentro: false, agente: true }), "centro");
  assert.strictEqual(vistaInicial({ hayArranque: true, abrirCentro: true, agente: true }), "centro");
});

test("vistaInicial: hay arranque y agente apagado → el ritual de siempre, sin tocar nada", () => {
  assert.strictEqual(vistaInicial({ hayArranque: true, abrirCentro: false, agente: false }), "ritual");
  assert.strictEqual(vistaInicial({ hayArranque: true, abrirCentro: true, agente: false }), "ritual");
});

test("vistaInicial: sin arranque, el centro se abre solo si tocaba (agente no importa)", () => {
  assert.strictEqual(vistaInicial({ hayArranque: false, abrirCentro: true, agente: true }), "centro");
  assert.strictEqual(vistaInicial({ hayArranque: false, abrirCentro: true, agente: false }), "centro");
});

test("vistaInicial: sin arranque y sin apertura, nada", () => {
  assert.strictEqual(vistaInicial({ hayArranque: false, abrirCentro: false, agente: true }), null);
  assert.strictEqual(vistaInicial({ hayArranque: false, abrirCentro: false, agente: false }), null);
});

// Fix round 1 de T3: `matutino` es SOLO la primera vez que el Centro
// reemplaza al arranque. `RitualHost` lo apaga tras ese primer montaje
// (`onMatutinoRegistrado`); esta función solo decide el valor INICIAL.

test("matutinoInicial: agente encendido y había arranque → true", () => {
  assert.strictEqual(matutinoInicial({ hayArranque: true, agente: true }), true);
});

test("matutinoInicial: sin arranque, aunque el agente esté encendido → false", () => {
  assert.strictEqual(matutinoInicial({ hayArranque: false, agente: true }), false);
});

test("matutinoInicial: agente apagado, aunque hubiera arranque → false", () => {
  assert.strictEqual(matutinoInicial({ hayArranque: true, agente: false }), false);
});
