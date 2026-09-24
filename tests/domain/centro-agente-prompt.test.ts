// tests/domain/centro-agente-prompt.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_AGENTE, promptDelTurno } from "../../src/lib/domain/centro/agente/prompt.ts";

test("El system nombra todos los bloques y la regla de las cifras", () => {
  for (const k of ["lista", "metricas", "tabla", "grafica", "tarjetas", "linea", "ir_a", "recomendaciones", "insight", "mercado", "hoy"]) {
    assert.ok(SYSTEM_AGENTE.includes(`«${k}»`), k);
  }
  assert.match(SYSTEM_AGENTE, /nunca escribas una cifra dentro de un bloque/i);
  assert.match(SYSTEM_AGENTE, /fila:<tabla>:<id>/);
});

test("El prompt lleva contexto, historial y la pregunta, en ese orden", () => {
  const p = promptDelTurno({ contexto: "CTX", historial: [{ rol: "persona", texto: "hola" }, { rol: "agente", texto: "qué tal" }], texto: "¿cómo voy?" });
  assert.ok(p.indexOf("CTX") < p.indexOf("hola") && p.indexOf("hola") < p.indexOf("¿cómo voy?"));
});
