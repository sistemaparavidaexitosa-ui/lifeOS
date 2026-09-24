// tests/domain/centro-runtime-intencion.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarIntencion, MAX_TEXTO_INTENCION } from "../../src/lib/domain/centro/runtime/intencion.ts";

// De una frase a uno de seis intentos, sin modelo. Las frases son las del
// encargo, en los dos idiomas en que se escribió.

test("Sin texto es «hoy»: abrir el Centro es preguntar qué toca", () => {
  assert.deepStrictEqual(interpretarIntencion(null), { kind: "hoy" });
  assert.deepStrictEqual(interpretarIntencion("   "), { kind: "hoy" });
});

test("Hoy", () => {
  assert.strictEqual(interpretarIntencion("What should I do today?").kind, "hoy");
  assert.strictEqual(interpretarIntencion("¿Qué hago hoy?").kind, "hoy");
  assert.strictEqual(interpretarIntencion("Planea mi día").kind, "hoy");
});

test("Portafolio", () => {
  assert.strictEqual(interpretarIntencion("Show my stocks").kind, "portafolio");
  assert.strictEqual(interpretarIntencion("¿Cómo van mis acciones?").kind, "portafolio");
  assert.strictEqual(
    interpretarIntencion("Muéstrame los tickers que tengo en mi watchlist y su rendimiento hoy").kind,
    "portafolio"
  );
});

test("Semana", () => {
  assert.strictEqual(interpretarIntencion("Plan my week").kind, "semana");
  assert.strictEqual(interpretarIntencion("Planea mi semana").kind, "semana");
});

test("Dinero", () => {
  assert.strictEqual(interpretarIntencion("Show my money").kind, "dinero");
  assert.strictEqual(interpretarIntencion("¿Cómo va mi presupuesto?").kind, "dinero");
});

test("Proyecto, con el nombre tal como se escribió", () => {
  assert.deepStrictEqual(interpretarIntencion("Open Malpaso"), { kind: "proyecto", ref: "Malpaso" });
  assert.deepStrictEqual(interpretarIntencion("Muéstrame Malpaso"), { kind: "proyecto", ref: "Malpaso" });
  assert.deepStrictEqual(interpretarIntencion("abre el proyecto Malpaso"), { kind: "proyecto", ref: "Malpaso" });
});

test("Lo que no se entiende es «libre», con el texto, y no un intento adivinado", () => {
  assert.deepStrictEqual(interpretarIntencion("hola"), { kind: "libre", texto: "hola" });
});

test("Un texto enorme se recorta antes de mirarlo", () => {
  const r = interpretarIntencion("x".repeat(5000));
  assert.strictEqual(r.kind, "libre");
  assert.strictEqual(r.texto?.length, MAX_TEXTO_INTENCION);
});
