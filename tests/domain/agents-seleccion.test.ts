import { test } from "node:test";
import assert from "node:assert/strict";
import { agentesPara, dominiosVisibles } from "../../src/lib/domain/agents/seleccion.ts";
import { agente, evento } from "./agentes-de-prueba.ts";

// La selección es determinista a propósito (D-171): el modelo escribe DENTRO de
// un agente, pero nunca decide cuál corre. Estas pruebas son la garantía de que
// se puede explicar por qué actuó quien actuó.

const TODO = ["money", "execution", "time", "habits", "debt", "activity", "nutrition", "growth"] as const;

test("elige solo a quien responde a ese disparo", () => {
  const manana = agente("de-manana", { triggers: ["cron.manana"] });
  const noche = agente("de-noche", { triggers: ["cron.noche"] });

  const elegidos = agentesPara(evento("cron.manana"), [manana, noche], TODO);

  assert.deepEqual(elegidos.map((a) => a.id), ["de-manana"]);
});

test("un agente apagado no se selecciona nunca", () => {
  const apagado = agente("apagado", { enabled: false });

  assert.deepEqual(agentesPara(evento(), [apagado], TODO), []);
});

test("ordena por prioridad, y desempata por id", () => {
  const elegidos = agentesPara(
    evento(),
    [
      agente("zeta", { priority: 10 }),
      agente("alfa", { priority: 10 }),
      agente("urgente", { priority: 1 })
    ],
    TODO
  );

  // El desempate por id no es cosmético: sin él el orden lo decide el orden de
  // los imports, y una prueba de «qué se propuso primero» fallaría los martes.
  assert.deepEqual(elegidos.map((a) => a.id), ["urgente", "alfa", "zeta"]);
});

test("un agente cuyos dominios están todos apagados no entra", () => {
  const dinero = agente("dinero", { domains: ["money"] });

  assert.deepEqual(agentesPara(evento(), [dinero], ["habits"]), []);
});

// `some` y no `every`: un agente que mira dinero y hábitos sigue siendo útil
// con solo hábitos encendido. Verá menos, y de eso se encarga acotarContexto().
test("basta con que UN dominio esté autorizado", () => {
  const mixto = agente("mixto", { domains: ["money", "habits"] });

  assert.deepEqual(
    agentesPara(evento(), [mixto], ["habits"]).map((a) => a.id),
    ["mixto"]
  );
});

test("sin dominios autorizados no actúa nadie", () => {
  assert.deepEqual(agentesPara(evento(), [agente("a"), agente("b")], []), []);
});

test("un agente con varios disparos responde a todos los suyos", () => {
  const multi = agente("multi", { triggers: ["cron.manana", "centro.abierto"] });

  assert.equal(agentesPara(evento("cron.manana"), [multi], TODO).length, 1);
  assert.equal(agentesPara(evento("centro.abierto"), [multi], TODO).length, 1);
  assert.equal(agentesPara(evento("cron.noche"), [multi], TODO).length, 0);
});

test("dominiosVisibles es la intersección, conservando el orden del agente", () => {
  const a = agente("x", { domains: ["money", "habits", "growth"] });

  assert.deepEqual(dominiosVisibles(a, ["growth", "money"]), ["money", "growth"]);
  assert.deepEqual(dominiosVisibles(a, ["nutrition"]), []);
});

test("la selección no muta la lista que recibe", () => {
  const agentes = [agente("zeta", { priority: 9 }), agente("alfa", { priority: 1 })];

  agentesPara(evento(), agentes, TODO);

  assert.deepEqual(agentes.map((a) => a.id), ["zeta", "alfa"]);
});
