// tests/domain/graph-suggestions.test.ts
// De candidata de SQL a botón. Si algo de aquí se rompe, el modelo acaba
// eligiendo algo que no salió del detector, o una sugerencia descartada vuelve.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparSinMeta, candidatosAutorizados, huellaArista, propuestaDeArista, validarElegidas, type Candidato
} from "../../src/lib/domain/graph/suggestions.ts";
import type { Domain } from "../../src/lib/domain/insights/types.ts";

const H = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const G = "33333333-3333-4333-8333-333333333333";
const T1 = "44444444-4444-4444-8444-444444444444";
const T2 = "55555555-5555-4555-8555-555555555555";

const DOMINIOS: Record<string, Domain> = { habits: "habits", projects: "execution", personal_goals: "growth", tasks: "execution" };
const dominioDeTabla = (t: string) => DOMINIOS[t] ?? null;

const habitoMeta: Candidato = { patron: "sin_meta", sourceEntityId: H, sourceLabel: "Duolingo", sourceTable: "habits", targetEntityId: G, targetLabel: "Aprender francés", targetTable: "personal_goals", relType: "supports", similitud: null };
const proyectoMeta: Candidato = { ...habitoMeta, sourceEntityId: P, sourceLabel: "Viaje a Lyon", sourceTable: "projects" };
const duplicado: Candidato = { patron: "posible_duplicado", sourceEntityId: T1, sourceLabel: "Pagar luz", sourceTable: "tasks", targetEntityId: T2, targetLabel: "Pagar luz.", targetTable: "tasks", relType: "duplicates", similitud: 0.95 };

test("huellaArista: estable, y simétrica solo para las relaciones simétricas", () => {
  assert.equal(huellaArista("supports", H, G), `arista:supports:${H}:${G}`);
  assert.notEqual(huellaArista("supports", H, G), huellaArista("supports", G, H));
  assert.equal(huellaArista("duplicates", T2, T1), huellaArista("duplicates", T1, T2));
});

test("candidatosAutorizados: si un extremo es de un dominio apagado, la candidata no llega al modelo", () => {
  assert.deepStrictEqual(candidatosAutorizados([habitoMeta, duplicado], ["habits", "execution"], dominioDeTabla), [duplicado]);
  assert.equal(candidatosAutorizados([habitoMeta, proyectoMeta, duplicado], ["habits", "execution", "growth"], dominioDeTabla).length, 3);
});

test("agruparSinMeta: sueltos y metas sin repetir, en orden de aparición", () => {
  const { sueltos, metas } = agruparSinMeta([habitoMeta, proyectoMeta, duplicado]);
  assert.deepStrictEqual(sueltos.map((s) => s.label), ["Duolingo", "Viaje a Lyon"]);
  assert.deepStrictEqual(metas.map((m) => m.label), ["Aprender francés"]);
});

test("validarElegidas: descarta índices fuera de rango, repetidos y lo que sobra del tope", () => {
  const bruto = { elegidas: [
    { suelto: 0, meta: 0, porque: "práctica diaria" },
    { suelto: 0, meta: 0, porque: "repetida" },
    { suelto: 7, meta: 0, porque: "fuera de rango" },
    { suelto: 1, meta: 0, porque: "el viaje es para practicar" }
  ] };
  assert.deepStrictEqual(validarElegidas(bruto, 2, 1), [
    { suelto: 0, meta: 0, porque: "práctica diaria" },
    { suelto: 1, meta: 0, porque: "el viaje es para practicar" }
  ]);
  assert.equal(validarElegidas(bruto, 2, 1, 1).length, 1);
  assert.deepStrictEqual(validarElegidas("basura", 2, 1), []);
});

test("propuestaDeArista: produce una propuesta ya saneada, lista para la cola", () => {
  const p = propuestaDeArista(habitoMeta, "práctica diaria del idioma");
  assert.equal(p?.tipo, "arista");
  assert.deepStrictEqual(p?.payload, { source: H, target: G, rel: "supports", confianza: "0.6" });
  assert.match(p?.titulo ?? "", /Duolingo/);
  const d = propuestaDeArista(duplicado, "Tienen casi el mismo nombre.");
  assert.equal(d?.payload.rel, "duplicates");
});
