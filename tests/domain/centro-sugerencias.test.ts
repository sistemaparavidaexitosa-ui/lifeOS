// tests/domain/centro-sugerencias.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoValido, sanearSugerencias, MAX_SUGERENCIAS } from "../../src/lib/domain/centro/sugerencias.ts";
import type { PropuestaCruda } from "../../src/lib/domain/coach/proposals.ts";

// La diferencia entre una sugerencia y un enlace roto que el modelo se imaginó
// (D-167). Todo lo de aquí corre en el servidor ANTES de guardar nada.

const MIO = "11111111-1111-4111-8111-111111111111";
const AJENO = "99999999-9999-4999-8999-999999999999";
const proyectos = [{ id: MIO }];

function foco(href: string, titulo = "Sigue con eso"): PropuestaCruda {
  return { tipo: "foco", titulo, detalle: "", datos: JSON.stringify({ href, motivo: "12 movimientos" }) };
}

// ---------------------------------------------------------------------------
// destinoValido
// ---------------------------------------------------------------------------

test("Una ruta del menú vale", () => {
  assert.strictEqual(destinoValido("/money", proyectos), true);
  assert.strictEqual(destinoValido("/execution", proyectos), true);
});

test("Una ruta inventada no vale", () => {
  assert.strictEqual(destinoValido("/inventado", proyectos), false);
});

test("Una ruta oculta del menú tampoco: no se ofrece lo que no se ofrece", () => {
  assert.strictEqual(destinoValido("/activity", proyectos), false);
});

test("Un proyecto propio vale", () => {
  assert.strictEqual(destinoValido(`/execution?project=${MIO}`, proyectos), true);
});

test("Un proyecto ajeno no: la IA no abre lo que no es tuyo", () => {
  assert.strictEqual(destinoValido(`/execution?project=${AJENO}`, proyectos), false);
});

test("Un identificador que ni siquiera es un uuid no vale", () => {
  assert.strictEqual(destinoValido("/execution?project=lo-que-sea", proyectos), false);
});

test("Una dirección externa nunca", () => {
  assert.strictEqual(destinoValido("https://evil.example", proyectos), false);
  assert.strictEqual(destinoValido("//evil.example", proyectos), false);
  assert.strictEqual(destinoValido("javascript:alert(1)", proyectos), false);
});

test("Una ruta vacía tampoco", () => {
  assert.strictEqual(destinoValido("", proyectos), false);
});

// ---------------------------------------------------------------------------
// sanearSugerencias
// ---------------------------------------------------------------------------

const ctx = { proyectos, yaPropuestas: [] as string[] };

test("Corta a tres: el centro no es una bandeja", () => {
  const muchas = [foco("/money", "a"), foco("/execution", "b"), foco("/planning", "c"), foco("/time", "d")];
  assert.strictEqual(sanearSugerencias(muchas, ctx).length, MAX_SUGERENCIAS);
});

test("Un foco con destino inventado se cae antes de guardarse", () => {
  assert.deepStrictEqual(sanearSugerencias([foco("/inventado")], ctx), []);
});

test("Un foco con un proyecto ajeno se cae", () => {
  assert.deepStrictEqual(sanearSugerencias([foco(`/execution?project=${AJENO}`)], ctx), []);
});

test("Un foco válido conserva su destino y su motivo", () => {
  const [sana] = sanearSugerencias([foco("/money")], ctx);
  assert.strictEqual(sana?.tipo, "foco");
  assert.strictEqual(sana?.payload.href, "/money");
  assert.strictEqual(sana?.payload.motivo, "12 movimientos");
});

test("No repite algo ya propuesto hoy, mire como mire las mayúsculas", () => {
  const conYa = { proyectos, yaPropuestas: ["sigue con eso"] };
  assert.deepStrictEqual(sanearSugerencias([foco("/money", "Sigue con eso")], conYa), []);
});

test("Tampoco se repite dos veces a sí misma en la misma tanda", () => {
  const dos = [foco("/money", "Abre Dinero"), foco("/execution", "Abre Dinero")];
  assert.strictEqual(sanearSugerencias(dos, ctx).length, 1);
});

test("Los tipos que crean algo siguen pasando por el saneado de siempre", () => {
  const tarea: PropuestaCruda = { tipo: "tarea", titulo: "Llamar al proveedor", detalle: "", datos: "{}" };
  const [sana] = sanearSugerencias([tarea], ctx);
  assert.strictEqual(sana?.tipo, "tarea");
  assert.strictEqual(sana?.titulo, "Llamar al proveedor");
});

test("Un tipo que no existe se cae", () => {
  const raro: PropuestaCruda = { tipo: "teletransporte", titulo: "x", detalle: "", datos: "{}" };
  assert.deepStrictEqual(sanearSugerencias([raro], ctx), []);
});

test("Una lista vacía devuelve una lista vacía, no revienta", () => {
  assert.deepStrictEqual(sanearSugerencias([], ctx), []);
});

test("Un foco sin título se cae: un botón sin texto no es una sugerencia", () => {
  const sinTitulo: PropuestaCruda = { tipo: "foco", titulo: "   ", detalle: "", datos: JSON.stringify({ href: "/money" }) };
  assert.deepStrictEqual(sanearSugerencias([sinTitulo], ctx), []);
});
