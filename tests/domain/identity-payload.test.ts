import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AgentResponseSchema,
  ManifestationPayloadSchema,
  MAX_AFIRMACIONES,
  MAX_PASOS,
  problemasDeForma
} from "../../src/lib/domain/identity/payload.ts";
import { sanearBrief, LIMITES_AGENTE } from "../../src/lib/domain/identity/brief.ts";

/**
 * EL MISMO ARCHIVO QUE LEE PYTEST.
 *
 * Es la prueba de contrato más barata que hay: los dos lados validan el mismo
 * JSON, así que una deriva entre el esquema de zod y los modelos de Pydantic
 * pone en rojo uno de los dos en vez de romperse un martes en producción.
 */
const EJEMPLO = JSON.parse(readFileSync(new URL("../../agents/contract/brief.example.json", import.meta.url), "utf8"));

function payload() {
  return structuredClone(EJEMPLO.payload);
}

test("el ejemplo del contrato pasa el esquema", () => {
  const r = AgentResponseSchema.safeParse(EJEMPLO);
  assert.equal(r.success, true, r.success ? "" : JSON.stringify(problemasDeForma(r.error)));
});

test("y además sobrevive al saneado real, que es lo que de verdad decide", () => {
  const r = sanearBrief(payload(), { rasgos: new Set(["t1", "t2"]), hechos: new Set(["habits.streak.h1"]), previas: [] }, LIMITES_AGENTE);
  assert.equal(r.ok, true);
  assert.equal(r.brief!.affirmations.length, 12);
  assert.equal(r.brief!.visualization.steps.length, 9);
  assert.equal(r.brief!.mantra, "Hoy elijo la versión de mí que no negocia sus mañanas");
  assert.equal(r.brief!.dailyAction!.area, "Carrera");
  assert.equal(r.brief!.focusArea, "Carrera");
  assert.deepEqual(r.problemas, []);
});

test("una clave de más se rechaza en vez de ignorarse en silencio", () => {
  // Casi siempre significa que los dos lados han derivado y que algo que el
  // agente cree estar mandando no se está guardando.
  const p = { ...payload(), inventado: "algo" };
  assert.equal(ManifestationPayloadSchema.safeParse(p).success, false);

  const anidado = payload();
  anidado.afirmaciones[0].peso = 3;
  assert.equal(ManifestationPayloadSchema.safeParse(anidado).success, false);
});

test("los arrays están acotados: un bucle en el agente no llena la base", () => {
  const muchas = payload();
  muchas.afirmaciones = Array.from({ length: MAX_AFIRMACIONES + 1 }, (_, i) => ({ texto: `Afirmación ${i}`, rasgoId: "", categoria: "Dinero" }));
  assert.equal(ManifestationPayloadSchema.safeParse(muchas).success, false);

  const muchosPasos = payload();
  muchosPasos.visualizacion.pasos = Array.from({ length: MAX_PASOS + 1 }, () => ({ texto: "paso", segundos: 30 }));
  assert.equal(ManifestationPayloadSchema.safeParse(muchosPasos).success, false);
});

test("los tipos imposibles se caen", () => {
  const negativos = payload();
  negativos.visualizacion.pasos[0].segundos = -5;
  assert.equal(ManifestationPayloadSchema.safeParse(negativos).success, false);

  const mantraRaro = payload();
  mantraRaro.mantra = 42;
  assert.equal(ManifestationPayloadSchema.safeParse(mantraRaro).success, false);

  const principioInventado = payload();
  principioInventado.cita.principio = "tolle";
  assert.equal(ManifestationPayloadSchema.safeParse(principioInventado).success, false);
});

test("una categoría desconocida SÍ pasa la forma: la resuelve el saneado", () => {
  // La distinción importa. Una categoría rara es una etiqueta que se cae y deja
  // la afirmación en «Otras»; rechazar el brief entero por eso sería perder
  // doce afirmaciones buenas por una palabra.
  const p = payload();
  p.afirmaciones[0].categoria = "Productividad";
  assert.equal(ManifestationPayloadSchema.safeParse(p).success, true);

  const r = sanearBrief(p, { rasgos: new Set(["t1", "t2"]), hechos: new Set(), previas: [] }, LIMITES_AGENTE);
  assert.equal(r.brief!.affirmations[0]!.category, null);
  assert.equal(r.brief!.affirmations.length, 12);
});

test("los problemas de forma se cuentan en español, para que el agente pueda corregir", () => {
  const roto = { ...payload(), recordatorio: "" };
  const r = ManifestationPayloadSchema.safeParse(roto);
  assert.equal(r.success, false);
  const problemas = problemasDeForma(r.error!);
  assert.ok(problemas.length > 0);
  assert.ok(problemas[0]!.startsWith("recordatorio:"), problemas[0]);
});

test("un rasgo o un hecho inventados NO se creen, vengan como vengan", () => {
  const p = payload();
  p.afirmaciones[0].rasgoId = "de-otra-persona";
  p.factIds = ["hecho.que.no.existe"];

  // La forma es impecable; es el saneado el que los descarta contra el contexto.
  assert.equal(ManifestationPayloadSchema.safeParse(p).success, true);
  const r = sanearBrief(p, { rasgos: new Set(["t1", "t2"]), hechos: new Set(["habits.streak.h1"]), previas: [] }, LIMITES_AGENTE);
  assert.equal(r.brief!.affirmations[0]!.traitId, null);
  assert.deepEqual(r.brief!.factIds, []);
});
