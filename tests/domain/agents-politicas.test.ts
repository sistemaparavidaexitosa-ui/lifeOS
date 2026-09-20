import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convieneActuar,
  generaEvidencia,
  identidadesIncompatibles,
  quienesActuan
} from "../../src/lib/domain/agents/politicas.ts";
import { agente, evento, historiaLimpia } from "./agentes-de-prueba.ts";

// Éste es el archivo que decide si LifeOS es respetuoso o insistente (D-171).
// La prueba más importante de la suite es la primera: el veredicto por defecto
// tiene que ser NO, y hay que argumentar para actuar, no para callar.

test("EL CASO POR DEFECTO: un agente que solo resume, calla", () => {
  const resumidor = agente("resumidor", { capabilities: ["resumir"] });

  const v = convieneActuar(resumidor, evento(), historiaLimpia());

  assert.equal(v.actuar, false);
  assert.match(v.actuar === false ? v.motivo : "", /actividad, no evidencia/);
});

test("un agente que propone en un área de identidad sí actúa", () => {
  const v = convieneActuar(agente("coach"), evento(), historiaLimpia());

  assert.equal(v.actuar, true);
});

test("un agente apagado calla, y el motivo lo dice", () => {
  const v = convieneActuar(agente("x", { enabled: false }), evento(), historiaLimpia());

  assert.equal(v.actuar, false);
  assert.match(v.actuar === false ? v.motivo : "", /apagado/);
});

test("no responde a un disparo que no es suyo", () => {
  const v = convieneActuar(agente("x", { triggers: ["cron.noche"] }), evento("cron.manana"), historiaLimpia());

  assert.equal(v.actuar, false);
});

// Un descarte de hoy no es ruido estadístico: es la persona diciendo que no.
test("si hoy ya descartaste algo suyo, no vuelve a hablar", () => {
  const v = convieneActuar(agente("coach"), evento(), {
    ...historiaLimpia(),
    descartadoHoy: true
  });

  assert.equal(v.actuar, false);
  assert.match(v.actuar === false ? v.motivo : "", /descartaste/);
});

test("el tope por franja se respeta, y el de riesgo alto es más estricto", () => {
  const bajo = agente("bajo", { riskLevel: "bajo" });
  const alto = agente("alto", { riskLevel: "alto" });
  const unaVez = { ...historiaLimpia(), vecesEnLaFranja: 1 };

  // Riesgo alto interrumpe MENOS, no más: si equivocarse duele, el precio de
  // insistir es mayor. Es lo contrario de optimizar para engagement.
  assert.equal(convieneActuar(bajo, evento(), unaVez).actuar, true);
  assert.equal(convieneActuar(alto, evento(), unaVez).actuar, false);
  assert.equal(convieneActuar(bajo, evento(), { ...historiaLimpia(), vecesEnLaFranja: 2 }).actuar, false);
});

// --- Evidencia vs actividad ---

test("sin identityServed no hay evidencia posible", () => {
  assert.equal(generaEvidencia(agente("x", { identityServed: [] }), evento()), false);
});

test("lo que la persona pide explícitamente no necesita justificarse", () => {
  const resumidor = agente("resumidor", {
    capabilities: ["resumir"],
    triggers: ["centro.abierto"]
  });

  // Abrir el centro ES la petición: ahí un resumen sí vale.
  assert.equal(generaEvidencia(resumidor, evento("centro.abierto")), true);
  assert.equal(convieneActuar(resumidor, evento("centro.abierto"), historiaLimpia()).actuar, true);
});

test("una revisión de identidad merece respuesta aunque solo sea un resumen", () => {
  const resumidor = agente("resumidor", {
    capabilities: ["resumir"],
    triggers: ["identidad.revisada"]
  });

  // Es el momento en que el sistema debe dejar de empujar hacia la versión de
  // enero de alguien que cambió en junio.
  assert.equal(generaEvidencia(resumidor, evento("identidad.revisada")), true);
});

test("detectar también genera evidencia", () => {
  assert.equal(generaEvidencia(agente("x", { capabilities: ["detectar"] }), evento()), true);
});

// --- Identidades incompatibles ---

test("dos agentes sin un área en común y ambos proponiendo, chocan", () => {
  const entrena = agente("entrena", { identityServed: ["Salud"] });
  const ahorra = agente("ahorra", { identityServed: ["Finanzas"] });

  assert.equal(identidadesIncompatibles(entrena, ahorra), true);
});

test("basta un área en común para NO ser incompatibles", () => {
  const a = agente("a", { identityServed: ["Salud", "Personal"] });
  const b = agente("b", { identityServed: ["Finanzas", "Personal"] });

  // Hay terreno común: las dos propuestas se pueden leer juntas.
  assert.equal(identidadesIncompatibles(a, b), false);
});

test("si alguno no propone, no hay conflicto que resolver", () => {
  const entrena = agente("entrena", { identityServed: ["Salud"] });
  const mira = agente("mira", { identityServed: ["Finanzas"], capabilities: ["detectar"] });

  assert.equal(identidadesIncompatibles(entrena, mira), false);
});

test("un agente nunca es incompatible consigo mismo", () => {
  const a = agente("a");
  assert.equal(identidadesIncompatibles(a, a), false);
});

// --- El veredicto conjunto ---

test("ante identidades que chocan, gana el primero y el segundo calla con motivo", () => {
  const primero = agente("entrena", { identityServed: ["Salud"], priority: 1 });
  const segundo = agente("ahorra", { identityServed: ["Finanzas"], priority: 2 });

  const { actuan, callan } = quienesActuan([primero, segundo], evento(), historiaLimpia());

  // Dejar pasar a los dos es la contradicción que paraliza: recibir a la vez
  // «entrena más» y «gasta menos en el gimnasio» no ayuda a elegir.
  assert.deepEqual(actuan.map((a) => a.id), ["entrena"]);
  assert.deepEqual(callan.map((c) => c.agente.id), ["ahorra"]);
  assert.match(callan[0]?.motivo ?? "", /se estorba/);
});

// El silencio tiene que poder explicarse, o es indistinguible de un fallo.
test("todo el que calla lleva un motivo legible", () => {
  const { callan } = quienesActuan(
    [
      agente("apagado", { enabled: false }),
      agente("resumidor", { capabilities: ["resumir"] })
    ],
    evento(),
    historiaLimpia()
  );

  assert.equal(callan.length, 2);
  for (const c of callan) {
    assert.ok(c.motivo.length > 10, `motivo demasiado pobre: «${c.motivo}»`);
    assert.match(c.motivo, new RegExp(c.agente.name));
  }
});

test("un día en que nadie debe hablar devuelve dos listas coherentes", () => {
  const { actuan, callan } = quienesActuan([], evento(), historiaLimpia());

  assert.deepEqual(actuan, []);
  assert.deepEqual(callan, []);
});
