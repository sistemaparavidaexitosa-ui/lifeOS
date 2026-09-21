import { test } from "node:test";
import assert from "node:assert/strict";
import { GROQ_MODELS, promptConEsquema } from "../../src/lib/domain/ai/groq.ts";

// El respaldo de la cadena (D-182). Lo poco que se puede decidir sin red.

test("la cadena tiene más de un modelo: uno retirado no avisa antes", () => {
  assert.ok(GROQ_MODELS.length >= 2);
  assert.equal(new Set(GROQ_MODELS).size, GROQ_MODELS.length, "sin repetidos");
});

test("el prompt lleva el esquema serializado, no traducido a prosa", () => {
  const esquema = { type: "OBJECT", properties: { titulo: { type: "STRING" } }, required: ["titulo"] };
  const p = promptConEsquema("Eres el coach.", esquema);

  assert.ok(p.startsWith("Eres el coach."), "el system original va primero");
  assert.ok(p.includes(JSON.stringify(esquema)), "el esquema va tal cual: una traducción a mano se quedaría vieja");
});

// Sin esto, Groq envuelve el JSON en ```json y `JSON.parse` revienta.
test("se le prohíbe explícitamente el bloque de código y el texto alrededor", () => {
  const p = promptConEsquema("x", {});

  assert.match(p, /ÚNICAMENTE con un objeto JSON/);
  assert.match(p, /bloque de código/);
});
