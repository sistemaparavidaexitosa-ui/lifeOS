import { test } from "node:test";
import assert from "node:assert/strict";
import { COACH_METADATOS, momentoDelDisparo } from "../../src/lib/domain/agents/coach.ts";
import { validarAgente } from "../../src/lib/domain/agents/contrato.ts";
import { crearRegistro } from "../../src/lib/domain/agents/registro.ts";
import { agentesPara } from "../../src/lib/domain/agents/seleccion.ts";
import { convieneActuar, identidadesIncompatibles } from "../../src/lib/domain/agents/politicas.ts";
import { acotarContexto } from "../../src/lib/domain/agents/contexto.ts";
import type { AnyAgentDefinition } from "../../src/lib/domain/agents/types.ts";
import type { Fact } from "../../src/lib/domain/insights/types.ts";
import { agente, evento, historiaLimpia } from "./agentes-de-prueba.ts";

// El primer agente REAL (D-172). Lo que se prueba aquí no es el coach —eso ya
// lo prueban coach-proposals y coach-schedule— sino que el contrato del Kernel
// le queda bien: si el primer agente de verdad necesitara torcerlo, el contrato
// estaría mal y es ahora cuando hay que saberlo.
//
// `ejecutar` NO se prueba aquí: vive en `lib/agents/coach-diario.ts`, lleva
// `server-only` y llamaría al modelo. Lo que se prueba es todo lo que decide
// SI se le llama y CON QUÉ, que es la parte nueva.

/** Los metadatos + un `ejecutar` de mentira: el agente tal y como lo ve el registro. */
const coach = { ...COACH_METADATOS, ejecutar: async () => ({ ok: true as const, datos: null }) };

const TODO = ["money", "execution", "time", "habits", "debt", "activity", "nutrition", "growth"] as const;

test("los metadatos del coach cumplen el contrato", () => {
  assert.equal(validarAgente(coach), null);
});

test("el coach entra en el registro y se recupera por su id", () => {
  const registro = crearRegistro();

  assert.equal(registro.registrar(coach).ok, true);
  assert.equal(registro.obtener("coach-diario")?.name, "Coach diario");
});

test("responde a las dos citas del día, y a nada más", () => {
  assert.equal(agentesPara(evento("cron.manana"), [coach], TODO).length, 1);
  assert.equal(agentesPara(evento("cron.noche"), [coach], TODO).length, 1);
  assert.equal(agentesPara(evento("centro.abierto"), [coach], TODO).length, 0);
  assert.equal(agentesPara(evento("habito.completado"), [coach], TODO).length, 0);
});

test("una vez por franja, no dos: riesgo medio", () => {
  assert.equal(convieneActuar(coach, evento(), historiaLimpia()).actuar, true);
  assert.equal(
    convieneActuar(coach, evento(), { ...historiaLimpia(), vecesEnLaFranja: 1 }).actuar,
    false
  );
});

// Es lo correcto para el agente que mira el conjunto: si el coach pudiera
// chocar, bloquearía a cualquier agente especializado que llegara después.
test("el coach no choca con nadie, porque sirve a las siete áreas", () => {
  const especialista = agente("dinero", { identityServed: ["Finanzas"] });
  const otro = agente("salud", { identityServed: ["Salud"] });

  assert.equal(identidadesIncompatibles(coach, especialista), false);
  assert.equal(identidadesIncompatibles(coach, otro), false);
  // Y los dos especialistas entre sí sí chocan: la regla no está rota.
  assert.equal(identidadesIncompatibles(especialista, otro), true);
});

test("arranca antes que nadie salvo lo puntual", () => {
  const puntual = agente("habito", { priority: 1, triggers: ["cron.manana"] });
  const orden = agentesPara(evento("cron.manana"), [coach, puntual], TODO);

  assert.deepEqual(orden.map((a) => a.id), ["habito", "coach-diario"]);
});

// --- Lo que ve, y lo que sabe que NO ve ---

const hecho = (id: string, domain: Fact["domain"]): Fact => ({
  id,
  domain,
  label: `hecho ${id}`,
  weight: 1,
  refs: []
});

test("pide los ocho dominios pero solo recibe los encendidos", () => {
  const r = acotarContexto(
    coach,
    {
      userId: "u1",
      today: "2026-09-20",
      timeZone: "America/Mexico_City",
      domains: ["habits", "money"],
      facts: [hecho("h1", "habits"), hecho("m1", "money")],
      memory: [],
      rejections: []
    },
    evento("cron.manana")
  );

  assert.equal(r.ok, true);
  assert.deepEqual(r.ok ? r.entrada.domains : null, ["money", "habits"]);
});

// Sin esto el coach redactaría como si tuviera la foto completa: es lo que
// impide que el silencio de la persona se lea como ausencia de problema.
test("sabe qué dominios pidió y no puede ver", () => {
  const r = acotarContexto(
    coach,
    {
      userId: "u1",
      today: "2026-09-20",
      timeZone: "America/Mexico_City",
      domains: ["habits"],
      facts: [],
      memory: [],
      rejections: []
    },
    evento("cron.manana")
  );

  assert.equal(r.ok, true);
  const saltados = r.ok ? r.entrada.skippedDomains : [];
  assert.ok(saltados.includes("money"), "el coach debe saber que no ve el dinero");
  assert.ok(saltados.includes("nutrition"));
  assert.ok(!saltados.includes("habits"), "lo que sí ve no puede estar en la lista");
});

// Un coach que dice «no sé nada de ti» cada mañana es peor que uno callado:
// la misma regla que ya aplicaba `daily.ts` a mano.
test("con todo apagado, el coach no corre", () => {
  const r = acotarContexto(
    coach,
    {
      userId: "u1",
      today: "2026-09-20",
      timeZone: "America/Mexico_City",
      domains: [],
      facts: [],
      memory: [],
      rejections: []
    },
    evento("cron.manana")
  );

  assert.equal(r.ok, false);
});

// --- La traducción disparo → momento ---

test("cada cron es su momento, y nada más lo es", () => {
  assert.equal(momentoDelDisparo("cron.manana"), "morning");
  assert.equal(momentoDelDisparo("cron.noche"), "night");
  // Devolver null y no suponer «mañana»: un «buenos días» a las once de la
  // noche es el fallo que nadie reporta y todo el mundo nota.
  assert.equal(momentoDelDisparo("centro.abierto"), null);
  assert.equal(momentoDelDisparo("identidad.revisada"), null);
  assert.equal(momentoDelDisparo("habito.completado"), null);
});

test("los metadatos siguen al contrato aunque gane campos", () => {
  // `COACH_METADATOS` es `Omit<AnyAgentDefinition, "ejecutar">`, así que un
  // campo obligatorio nuevo rompe la compilación en vez de colarse vacío. Esta
  // prueba fija la otra mitad: que no le sobre nada.
  const claves = Object.keys(COACH_METADATOS).sort();
  const esperadas = Object.keys(agente("x") as AnyAgentDefinition)
    .filter((k) => k !== "ejecutar")
    .sort();

  assert.deepEqual(claves, esperadas);
});
