import { test } from "node:test";
import assert from "node:assert/strict";
import { GROQ_MODELS, promptConEsquema } from "../../src/lib/domain/ai/groq.ts";
import { cuerpoDeGroq, debeProbarSiguiente, RESERVA_RAZONAMIENTO, RETIRADOS_DE_GROQ } from "../../src/lib/domain/ai/groq.ts";

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

// ---------------------------------------------------------------------------
// 2026-09-24: los dos modelos de la cadena llevaban apagados desde el 16-ago
// (console.groq.com/docs/deprecations). Todo respaldo fallaba con error.
// ---------------------------------------------------------------------------


test("ningún modelo de la cadena está retirado por Groq", () => {
  for (const m of GROQ_MODELS) assert.ok(!RETIRADOS_DE_GROQ.includes(m as never), `${m} está retirado`);
  assert.ok(RETIRADOS_DE_GROQ.includes("llama-3.3-70b-versatile" as never));
  assert.ok(RETIRADOS_DE_GROQ.includes("llama-3.1-8b-instant" as never));
});

test("el cuerpo pide JSON, razonamiento bajo y oculto, y deja sitio al razonamiento", () => {
  const c = cuerpoDeGroq({ model: "openai/gpt-oss-120b", system: "s", prompt: "p", esquema: {}, maxOutputTokens: 800 });
  assert.deepEqual(c.response_format, { type: "json_object" });
  assert.equal(c.reasoning_effort, "low");
  // En modo JSON Groq exige `parsed` o `hidden`; `hidden` deja `content` limpio.
  assert.equal(c.reasoning_format, "hidden");
  // Los tokens de razonamiento cuentan contra el tope: sin reserva, la
  // respuesta se corta por longitud antes de empezar el JSON.
  assert.equal(c.max_completion_tokens, 800 + RESERVA_RAZONAMIENTO);
  assert.equal("max_tokens" in c, false);
  assert.equal(c.messages[1]?.content, "p");
});

test("un modelo retirado o inexistente salta al siguiente de la cadena", () => {
  assert.equal(debeProbarSiguiente(404, ""), true);
  assert.equal(debeProbarSiguiente(400, '{"error":{"code":"model_decommissioned"}}'), true);
  assert.equal(debeProbarSiguiente(400, '{"error":{"code":"model_not_found"}}'), true);
});

test("429 y 5xx siguen saltando; la llave o una petición mala, no", () => {
  assert.equal(debeProbarSiguiente(429, ""), true);
  assert.equal(debeProbarSiguiente(503, ""), true);
  assert.equal(debeProbarSiguiente(401, ""), false);
  assert.equal(debeProbarSiguiente(400, '{"error":{"code":"invalid_request_error"}}'), false);
});
