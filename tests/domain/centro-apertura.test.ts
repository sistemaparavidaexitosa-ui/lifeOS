// tests/domain/centro-apertura.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { debeAbrirseElCentro, esModoNavegacion } from "../../src/lib/domain/centro/apertura.ts";

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
