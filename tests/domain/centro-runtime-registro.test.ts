// tests/domain/centro-runtime-registro.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearRegistroDeSecciones } from "../../src/components/centro-runtime/registro.ts";

// El renderer no importa componentes: los pide aquí por su `kind`. Estas
// pruebas usan funciones sueltas como componentes; el registro no sabe de JSX.

const Hero = () => null;
const OtroHero = () => null;

test("Se registra y se encuentra por su kind", () => {
  const r = crearRegistroDeSecciones();
  assert.deepStrictEqual(r.registrar("hero", Hero), { ok: true });
  assert.strictEqual(r.componenteDe("hero"), Hero);
});

test("Un kind sin componente es `null`, no una excepción", () => {
  assert.strictEqual(crearRegistroDeSecciones().componenteDe("portfolio"), null);
});

test("Un kind fuera del catálogo no se registra", () => {
  const r = crearRegistroDeSecciones();
  const res = r.registrar("iframe" as never, Hero);
  assert.strictEqual(res.ok, false);
  assert.deepStrictEqual(r.registrados(), []);
});

test("Lo que no es un componente no se registra", () => {
  const res = crearRegistroDeSecciones().registrar("hero", "Hero" as never);
  assert.strictEqual(res.ok, false);
});

test("Dos componentes para el mismo kind: gana el primero, y se dice", () => {
  const r = crearRegistroDeSecciones();
  r.registrar("hero", Hero);
  const res = r.registrar("hero", OtroHero);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(r.componenteDe("hero"), Hero);
});

test("Registrar el mismo componente dos veces no es un fallo (recarga en caliente)", () => {
  const r = crearRegistroDeSecciones();
  r.registrar("hero", Hero);
  assert.deepStrictEqual(r.registrar("hero", Hero), { ok: true });
});

test("La lista de registrados sale ordenada", () => {
  const r = crearRegistroDeSecciones();
  r.registrar("tasks", Hero);
  r.registrar("hero", Hero);
  assert.deepStrictEqual(r.registrados(), ["hero", "tasks"]);
});
