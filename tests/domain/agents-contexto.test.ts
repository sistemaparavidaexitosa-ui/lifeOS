import { test } from "node:test";
import assert from "node:assert/strict";
import { acotarContexto } from "../../src/lib/domain/agents/contexto.ts";
import type { ContextoAutorizado } from "../../src/lib/domain/agents/contexto.ts";
import type { Fact } from "../../src/lib/domain/insights/types.ts";
import { agente, evento } from "./agentes-de-prueba.ts";

// El Kernel NO construye contexto: eso es `buildContext()` (D-027). Lo único
// que hace este archivo es ESTRECHAR lo que ya autorizó la persona. Estrechar
// siempre es seguro; estas pruebas comprueban que nunca ensancha.

const hecho = (id: string, domain: Fact["domain"]): Fact => ({
  id,
  domain,
  label: `hecho ${id}`,
  weight: 1,
  refs: []
});

const base = (extra: Partial<ContextoAutorizado> = {}): ContextoAutorizado => ({
  userId: "u1",
  today: "2026-09-20",
  timeZone: "America/Mexico_City",
  domains: ["habits", "money"],
  facts: [hecho("h1", "habits"), hecho("m1", "money")],
  memory: ["No trabajo sábados"],
  rejections: ["Ya dije que no a madrugar"],
  ...extra
});

test("estrecha los dominios a los que el agente declaró", () => {
  const soloHabitos = agente("habitos", { domains: ["habits"] });

  const r = acotarContexto(soloHabitos, base(), evento());

  assert.equal(r.ok, true);
  assert.deepEqual(r.ok ? r.entrada.domains : null, ["habits"]);
});

// Sin este filtro, un agente de hábitos leería hechos de dinero solo porque la
// persona los tiene encendidos para otra cosa.
test("los hechos se filtran por dominio, no solo la lista de dominios", () => {
  const soloHabitos = agente("habitos", { domains: ["habits"] });

  const r = acotarContexto(soloHabitos, base(), evento());

  assert.deepEqual(r.ok ? r.entrada.facts.map((f) => f.id) : null, ["h1"]);
});

test("nunca ensancha: pedir un dominio apagado no lo enciende", () => {
  const glotón = agente("todo", { domains: ["habits", "money", "nutrition"] });

  const r = acotarContexto(glotón, base({ domains: ["habits"] }), evento());

  assert.deepEqual(r.ok ? r.entrada.domains : null, ["habits"]);
});

// Un agente que corre sin sus dominios produce texto que parece informado y no
// lo está, que es peor que no producir nada.
test("sin intersección el agente NO corre, y el motivo es para la persona", () => {
  const dinero = agente("dinero", { domains: ["money"] });

  const r = acotarContexto(dinero, base({ domains: ["habits"] }), evento());

  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /apagados/);
  assert.match(r.ok === false ? r.reason : "", /Agente dinero/);
});

test("memoria y rechazos pasan enteros: no llevan dominio que estrechar", () => {
  const r = acotarContexto(agente("x", { domains: ["habits"] }), base(), evento());

  assert.deepEqual(r.ok ? r.entrada.memory : null, ["No trabajo sábados"]);
  assert.deepEqual(r.ok ? r.entrada.rejections : null, ["Ya dije que no a madrugar"]);
});

test("el evento y la fecha viajan tal cual, sin recalcularse", () => {
  const e = evento("centro.abierto", "u1");

  const r = acotarContexto(agente("x", { triggers: ["centro.abierto"] }), base(), e);

  // Nunca `new Date()` dentro del agente: la fecha la fija quien llama.
  assert.equal(r.ok ? r.entrada.today : null, "2026-09-20");
  assert.equal(r.ok ? r.entrada.timeZone : null, "America/Mexico_City");
  assert.deepEqual(r.ok ? r.entrada.evento : null, e);
});

test("no muta el contexto que recibe", () => {
  const original = base();
  const copia = JSON.parse(JSON.stringify(original));

  acotarContexto(agente("x", { domains: ["habits"] }), original, evento());

  assert.deepEqual(original, copia);
});

test("un contexto sin hechos sigue siendo válido si hay dominios", () => {
  const r = acotarContexto(agente("x", { domains: ["habits"] }), base({ facts: [] }), evento());

  assert.equal(r.ok, true);
  assert.deepEqual(r.ok ? r.entrada.facts : null, []);
});
