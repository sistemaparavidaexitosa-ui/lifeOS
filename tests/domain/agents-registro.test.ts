import { test } from "node:test";
import assert from "node:assert/strict";
import { crearRegistro } from "../../src/lib/domain/agents/registro.ts";
import { validarAgente } from "../../src/lib/domain/agents/contrato.ts";
import type { AnyAgentDefinition } from "../../src/lib/domain/agents/types.ts";

// El registro es el único estado mutable del núcleo agentic (D-170). Todo lo
// que se prueba aquí se reduce a dos promesas: que nunca lanza, y que dos
// registros distintos no se ven entre sí.

function agente(id: string, extra: Partial<AnyAgentDefinition> = {}): AnyAgentDefinition {
  return {
    id,
    version: "1",
    descripcion: `Agente de prueba ${id}`,
    ejecutar: async () => ({ ok: true, datos: id }),
    ...extra
  };
}

test("registra un agente y lo devuelve por su id", () => {
  const registro = crearRegistro();

  const alta = registro.registrar(agente("coach-diario"));

  assert.equal(alta.ok, true);
  assert.equal(registro.obtener("coach-diario")?.descripcion, "Agente de prueba coach-diario");
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
    id: "roto",
    version: "1",
    descripcion: "No sabe hacer nada"
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

// --- El contrato, por separado: los motivos se pintan, así que se leen ---

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
  const sinDescripcion = validarAgente(agente("insights-semanal", { descripcion: "   " }));

  assert.match(sinDescripcion ?? "", /insights-semanal/);
  assert.match(sinDescripcion ?? "", /para qué sirve/);
});

test("validarAgente exige versión", () => {
  assert.match(validarAgente(agente("coach-diario", { version: "" })) ?? "", /versión/);
});
