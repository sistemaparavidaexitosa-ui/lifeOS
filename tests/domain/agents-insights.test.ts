import { test } from "node:test";
import assert from "node:assert/strict";
import { INSIGHTS_METADATOS } from "../../src/lib/domain/agents/insights.ts";
import { COACH_METADATOS } from "../../src/lib/domain/agents/coach.ts";
import { validarAgente } from "../../src/lib/domain/agents/contrato.ts";
import { crearRegistro } from "../../src/lib/domain/agents/registro.ts";
import { agentesPara } from "../../src/lib/domain/agents/seleccion.ts";
import { identidadesIncompatibles, quienesActuan } from "../../src/lib/domain/agents/politicas.ts";
import { acotarContexto } from "../../src/lib/domain/agents/contexto.ts";
import { agente, evento, historiaLimpia } from "./agentes-de-prueba.ts";

// El segundo agente (D-175). Lo que se prueba aquí NO es el análisis nocturno
// —eso ya lo cubren anchoring y nightly— sino que el Kernel deja de ser el
// coach con otro nombre: dos agentes registrados, seleccionados y convivendo.

const fingido = async () => ({ ok: true as const, datos: null });
const insights = { ...INSIGHTS_METADATOS, ejecutar: fingido };
const coach = { ...COACH_METADATOS, ejecutar: fingido };

const TODO = ["money", "execution", "time", "habits", "debt", "activity", "nutrition", "growth"] as const;

test("el análisis nocturno cumple el contrato SIN que hiciera falta cambiarlo", () => {
  // Es la prueba que justifica la fase: el coach obligó a añadir
  // `skippedDomains` y luego `herramientas`. Éste no pidió nada.
  assert.equal(validarAgente(insights), null);
});

test("los dos agentes conviven en el mismo registro", () => {
  const registro = crearRegistro();

  assert.equal(registro.registrar(coach).ok, true);
  assert.equal(registro.registrar(insights).ok, true);
  assert.deepEqual(
    registro.listar().map((a) => a.id),
    ["coach-diario", "insights-nocturno"]
  );
});

test("solo corre de noche, y de noche corren los dos", () => {
  assert.deepEqual(agentesPara(evento("cron.manana"), [coach, insights], TODO).map((a) => a.id), ["coach-diario"]);
  assert.deepEqual(
    agentesPara(evento("cron.noche"), [coach, insights], TODO).map((a) => a.id),
    ["coach-diario", "insights-nocturno"],
    "el coach tiene prioridad 10 y el análisis 20"
  );
});

// Declarar cinco áreas y no siete no es un descuido: no tiene ni un hecho sobre
// relaciones ni sobre lo espiritual, y fingir cobertura sería mentir.
test("sirve a cinco áreas, no a las siete", () => {
  assert.equal(INSIGHTS_METADATOS.identityServed.length, 5);
  assert.ok(!INSIGHTS_METADATOS.identityServed.includes("Relaciones"));
  assert.ok(!INSIGHTS_METADATOS.identityServed.includes("Espiritual"));
});

test("no choca con el coach: comparten cinco áreas", () => {
  assert.equal(identidadesIncompatibles(coach, insights), false);
});

// Y esto es lo que se ganó al no declarar las siete: ahora un especialista en
// relaciones SÍ puede entrar en conflicto con él, y el Kernel lo detecta.
test("ahora sí puede existir un conflicto de identidad detectable", () => {
  const relaciones = agente("relaciones", { identityServed: ["Relaciones"] });

  assert.equal(identidadesIncompatibles(insights, relaciones), true);
  // Con el coach, que sirve las siete, seguiría sin haber conflicto posible.
  assert.equal(identidadesIncompatibles(coach, relaciones), false);
});

test("de noche, ante un conflicto, gana el de más prioridad", () => {
  const relaciones = agente("relaciones", {
    identityServed: ["Relaciones"],
    triggers: ["cron.noche"],
    priority: 30
  });

  const candidatos = agentesPara(evento("cron.noche"), [insights, relaciones], TODO);
  const { actuan, callan } = quienesActuan(candidatos, evento("cron.noche"), historiaLimpia());

  assert.deepEqual(actuan.map((a) => a.id), ["insights-nocturno"]);
  assert.deepEqual(callan.map((c) => c.agente.id), ["relaciones"]);
});

// `activity` queda fuera a propósito: mide lo que hiciste, no lo que se torció.
test("no pide el dominio de actividad", () => {
  assert.ok(!INSIGHTS_METADATOS.domains.includes("activity"));
  assert.equal(INSIGHTS_METADATOS.domains.length, 7);
});

test("con sus dominios apagados no corre, y lo dice", () => {
  const r = acotarContexto(
    insights,
    {
      userId: "u1",
      today: "2026-09-20",
      timeZone: "America/Mexico_City",
      domains: ["activity"],
      facts: [],
      memory: [],
      rejections: []
    },
    evento("cron.noche")
  );

  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /Análisis nocturno/);
});

test("riesgo bajo: dos turnos por franja, frente al único del coach", () => {
  const unaVez = { ...historiaLimpia(), vecesEnLaFranja: 1 };
  const e = evento("cron.noche");

  const { actuan } = quienesActuan([insights], e, unaVez);
  const { actuan: coachActua } = quienesActuan([coach], e, unaVez);

  assert.deepEqual(actuan.map((a) => a.id), ["insights-nocturno"]);
  assert.deepEqual(coachActua, [], "el coach es riesgo medio: un turno y se calla");
});
