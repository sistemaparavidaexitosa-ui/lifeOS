// tests/domain/centro-franja.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { franjaDeHoy, FRANJAS } from "../../src/lib/domain/centro/franja.ts";

// Las franjas deciden cuántas veces al día piensa el centro (D-167). Lo que se
// fija aquí son las fronteras, que es lo único que puede estar mal, y que no
// haya huecos: una hora sin franja sería una hora sin sugerencias y sin motivo.

test("Antes de las 12 es mañana", () => {
  assert.strictEqual(franjaDeHoy(0), "manana");
  assert.strictEqual(franjaDeHoy(6), "manana");
  assert.strictEqual(franjaDeHoy(11), "manana");
});

test("De 12 a 18 es tarde", () => {
  assert.strictEqual(franjaDeHoy(12), "tarde");
  assert.strictEqual(franjaDeHoy(18), "tarde");
});

test("Desde las 19 es noche, el mismo corte que el tema del ritual", () => {
  assert.strictEqual(franjaDeHoy(19), "noche");
  assert.strictEqual(franjaDeHoy(23), "noche");
});

test("Las dos fronteras exactas", () => {
  assert.strictEqual(franjaDeHoy(11), "manana");
  assert.strictEqual(franjaDeHoy(12), "tarde");
  assert.strictEqual(franjaDeHoy(18), "tarde");
  assert.strictEqual(franjaDeHoy(19), "noche");
});

test("Las 24 horas tienen franja: ni huecos ni solapes", () => {
  for (let h = 0; h < 24; h++) {
    assert.ok(FRANJAS.includes(franjaDeHoy(h)), `la hora ${h} se quedó sin franja`);
  }
});

test("Una hora imposible no rompe la pantalla", () => {
  assert.strictEqual(franjaDeHoy(-1), "manana");
  assert.strictEqual(franjaDeHoy(99), "manana");
  assert.strictEqual(franjaDeHoy(Number.NaN), "manana");
});
