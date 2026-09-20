import { test } from "node:test";
import assert from "node:assert/strict";
import { crearRegistro } from "../../src/lib/domain/agents/registro.ts";
import { validarAgente } from "../../src/lib/domain/agents/contrato.ts";
import type { AnyAgentDefinition } from "../../src/lib/domain/agents/types.ts";
import { agente } from "./agentes-de-prueba.ts";

// El registro es el único estado mutable del núcleo agentic (D-170). Todo lo
// que se prueba aquí se reduce a dos promesas: que nunca lanza, y que dos
// registros distintos no se ven entre sí.
//
// La segunda mitad prueba el contrato (D-171). Los motivos se PINTAN, así que
// se leen: un motivo que no nombra al agente obliga a quien lo lee a adivinar
// cuál de veinte falló.

const roto = (extra: Partial<AnyAgentDefinition>) =>
  validarAgente(agente("coach-diario", extra)) ?? "";

test("registra un agente y lo devuelve por su id", () => {
  const registro = crearRegistro();

  const alta = registro.registrar(agente("coach-diario"));

  assert.equal(alta.ok, true);
  assert.equal(registro.obtener("coach-diario")?.name, "Agente coach-diario");
});

test("un registro recién creado está vacío", () => {
  assert.deepEqual(crearRegistro().listar(), []);
});

test("un id desconocido devuelve null, no lanza", () => {
  assert.equal(crearRegistro().obtener("no-existe"), null);
});

test("listar ordena por id, no por orden de registro", () => {
  const registro = crearRegistro();
  registro.registrar(agente("zeta"));
  registro.registrar(agente("alfa"));
  registro.registrar(agente("media"));

  assert.deepEqual(
    registro.listar().map((a) => a.id),
    ["alfa", "media", "zeta"]
  );
});

test("un id duplicado se rechaza con motivo, y gana el primero", () => {
  const registro = crearRegistro();
  registro.registrar(agente("coach-diario", { version: "1" }));

  const segundo = registro.registrar(agente("coach-diario", { version: "2" }));

  assert.equal(segundo.ok, false);
  assert.match(segundo.reason ?? "", /coach-diario/);
  // Lo importante no es el rechazo: es que el que ya estaba sigue intacto.
  assert.equal(registro.obtener("coach-diario")?.version, "1");
  assert.equal(registro.listar().length, 1);
});

test("una definición inválida no entra, y el registro sigue usable", () => {
  const registro = crearRegistro();

  const sinEjecutar = registro.registrar({
    ...agente("roto"),
    ejecutar: undefined
  } as unknown as AnyAgentDefinition);

  assert.equal(sinEjecutar.ok, false);
  assert.equal(registro.obtener("roto"), null);
  assert.equal(registro.registrar(agente("bueno")).ok, true);
});

test("dos registros no comparten estado", () => {
  const uno = crearRegistro();
  const otro = crearRegistro();

  uno.registrar(agente("solo-en-uno"));

  assert.equal(otro.obtener("solo-en-uno"), null);
  assert.deepEqual(otro.listar(), []);
});

// --- El contrato ---

test("validarAgente acepta una definición completa", () => {
  assert.equal(validarAgente(agente("coach-diario")), null);
});

test("validarAgente rechaza lo que ni siquiera es un objeto", () => {
  assert.match(validarAgente(null) ?? "", /objeto/);
  assert.match(validarAgente("coach") ?? "", /objeto/);
});

test("validarAgente exige un id con forma estable", () => {
  assert.match(validarAgente(agente("")) ?? "", /identificador/);
  // Mayúsculas, espacios y puntos quedan fuera: el id acaba en base y en URL.
  assert.match(validarAgente(agente("Coach Diario")) ?? "", /minúsculas/);
  assert.match(validarAgente(agente("coach.diario")) ?? "", /minúsculas/);
  assert.match(validarAgente(agente("-coach")) ?? "", /minúsculas/);
  assert.equal(validarAgente(agente("coach-diario-2")), null);
});

test("validarAgente nombra el agente en el motivo, para poder buscarlo", () => {
  const sinDescripcion = roto({ descripcion: "   " });

  assert.match(sinDescripcion, /coach-diario/);
  assert.match(sinDescripcion, /para qué sirve/);
});

test("validarAgente exige nombre legible y versión", () => {
  assert.match(roto({ name: "  " }), /nombre legible/);
  assert.match(roto({ version: "" }), /versión/);
});

// La puerta de privacidad: sin dominios no hay intersección con ai_domains, y
// un agente sin intersección no es «uno que lo ve todo», es uno que no se
// puede auditar.
test("validarAgente exige dominios, y que existan", () => {
  assert.match(roto({ domains: [] }), /dominios/);
  assert.match(roto({ domains: ["telepatia"] as never }), /no existe/);
  assert.equal(validarAgente(agente("x", { domains: ["money", "habits"] })), null);
});

test("validarAgente exige identityServed, y que sean las siete áreas", () => {
  assert.match(roto({ identityServed: [] }), /a qué versión de ti sirve/);
  assert.match(roto({ identityServed: ["Productividad"] as never }), /no existe/);
  assert.equal(validarAgente(agente("x", { identityServed: ["Salud", "Finanzas"] })), null);
});

test("validarAgente rechaza disparos y capacidades inventadas", () => {
  assert.match(roto({ triggers: [] }), /qué lo despierta/);
  assert.match(roto({ triggers: ["luna.llena"] as never }), /nadie emite/);
  assert.match(roto({ capabilities: [] }), /qué sabe hacer/);
  assert.match(roto({ capabilities: ["escribir"] as never }), /no existe/);
});

// El vocabulario admite tres autonomías y la política acepta una. Que el tipo
// pueda nombrar lo que la regla prohíbe es lo que permite probar el rechazo.
test("validarAgente solo permite la autonomía «propone»", () => {
  assert.equal(validarAgente(agente("x", { autonomyLevel: "propone" })), null);
  assert.match(roto({ autonomyLevel: "autonomo" }), /sólo se permite «propone»/);
  assert.match(roto({ autonomyLevel: "actua_con_permiso" }), /sólo se permite «propone»/);
});

test("validarAgente exige riesgo, encendido y prioridad", () => {
  assert.match(roto({ riskLevel: "regular" as never }), /cuánto duele/);
  assert.match(roto({ enabled: undefined as never }), /si está encendido/);
  assert.match(roto({ priority: Number.NaN }), /prioridad/);
  // Un agente apagado es VÁLIDO: apagarlo no lo expulsa del registro.
  assert.equal(validarAgente(agente("x", { enabled: false })), null);
});

test("validarAgente exige presupuesto, y que deje sitio para responder", () => {
  assert.match(roto({ budget: undefined as never }), /presupuesto/);
  assert.match(roto({ budget: { maxOutputTokens: 0, thinkingBudget: 0 } }), /tope de salida/);
  assert.match(roto({ budget: { maxOutputTokens: 100, thinkingBudget: -1 } }), /pensamiento/);
  // El peor fallo del proveedor: MAX_TOKENS con el texto vacío. Se atrapa aquí.
  assert.match(
    roto({ budget: { maxOutputTokens: 100, thinkingBudget: 100 } }),
    /quedarse sin respuesta/
  );
});
