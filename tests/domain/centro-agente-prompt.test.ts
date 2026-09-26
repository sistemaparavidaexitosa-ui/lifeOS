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

test("ANTES DE DIBUJAR, LEE: `buscar` es la primera opción cuando se nombra algo", () => {
  const lee = SYSTEM_AGENTE.slice(SYSTEM_AGENTE.indexOf("ANTES DE DIBUJAR, LEE"));
  const parrafo = lee.slice(0, lee.indexOf("\n\n"));
  assert.match(parrafo, /\bbuscar\b/);
  assert.ok(parrafo.indexOf("buscar") < parrafo.indexOf("consultar"), "buscar va antes que consultar");
});

test("El system explica propuesta_cambio, esquema_de_tabla y trae el índice de tablas", () => {
  assert.ok(SYSTEM_AGENTE.includes("«propuesta_cambio»"));
  assert.match(SYSTEM_AGENTE, /esquema_de_tabla/);
  for (const t of ["tasks", "notes", "food_entries"]) assert.ok(SYSTEM_AGENTE.includes(t), t);
  assert.match(SYSTEM_AGENTE, /Nunca digas que ya quedó (guardado|registrado)/);
});

test("El system pide respuestas más largas, explica la confirmación y recordar", () => {
  assert.ok(!SYSTEM_AGENTE.includes("1–3 frases"));
  assert.match(SYSTEM_AGENTE, /hasta cuatro párrafos/);
  for (const k of ["confirmar_entendimiento", "recordar"]) assert.ok(SYSTEM_AGENTE.includes(`«${k}»`), k);
  assert.match(SYSTEM_AGENTE, /no propongas cambios en ese turno/i);
  assert.match(SYSTEM_AGENTE, /Lo tendré en cuenta/);
});

test("El prompt lleva los resultados recientes cuando los hay", () => {
  const p = promptDelTurno({ contexto: "CTX", historial: [], texto: "hola", resultados: ["Crear · Comida: guardaste 2, descartaste 1."] });
  assert.match(p, /Cómo te fue con mis propuestas \(últimos 30 días\):\n- Crear · Comida/);
  assert.ok(p.indexOf("Cómo te fue") < p.indexOf("Persona: hola"));
  assert.ok(!promptDelTurno({ contexto: "CTX", historial: [], texto: "hola" }).includes("Cómo te fue"));
});
