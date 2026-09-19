// tests/domain/ritual-tema.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { temaDelRitual, INICIO_NOCHE, FIN_NOCHE } from "../../src/lib/domain/ritual/tema.ts";

// El tema del arranque lo decide la HORA LOCAL DEL PERFIL, no
// `prefers-color-scheme` (D-165): blanco de día, invertido de noche. Lo que se
// fija aquí son las dos fronteras, que es lo único que puede estar mal.

test("temaDelRitual: de día es claro", () => {
  assert.strictEqual(temaDelRitual(7), "claro");
  assert.strictEqual(temaDelRitual(12), "claro");
  assert.strictEqual(temaDelRitual(18), "claro");
});

test("temaDelRitual: de noche es oscuro", () => {
  assert.strictEqual(temaDelRitual(19), "oscuro");
  assert.strictEqual(temaDelRitual(23), "oscuro");
  assert.strictEqual(temaDelRitual(0), "oscuro");
  assert.strictEqual(temaDelRitual(6), "oscuro");
});

test("temaDelRitual: las fronteras exactas, que es lo que se rompe al tocarlo", () => {
  // 06:59 todavía es de noche; a las 07:00 empieza el día.
  assert.strictEqual(temaDelRitual(FIN_NOCHE - 1), "oscuro");
  assert.strictEqual(temaDelRitual(FIN_NOCHE), "claro");
  // 18:59 todavía es de día; a las 19:00 empieza la noche.
  assert.strictEqual(temaDelRitual(INICIO_NOCHE - 1), "claro");
  assert.strictEqual(temaDelRitual(INICIO_NOCHE), "oscuro");
});

test("temaDelRitual: una hora imposible no rompe la pantalla", () => {
  // `hourInTimeZone` no devuelve esto, pero el valor llega desde el servidor por
  // props y una pantalla en blanco sería peor que un tema por defecto.
  assert.strictEqual(temaDelRitual(-1), "claro");
  assert.strictEqual(temaDelRitual(99), "claro");
  assert.strictEqual(temaDelRitual(Number.NaN), "claro");
});
