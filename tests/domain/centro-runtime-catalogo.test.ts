// tests/domain/centro-runtime-catalogo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_KINDS, esSectionKind } from "../../src/lib/domain/centro/runtime/secciones.ts";
import { INTENT_KINDS } from "../../src/lib/domain/centro/runtime/types.ts";
import { resolverFlags, FLAGS_APAGADOS } from "../../src/lib/domain/centro/runtime/flags.ts";

// El catálogo es el contrato entre quien decide QUÉ (el generador, mañana el
// modelo) y quien decide CÓMO (el renderer). Y los flags son lo que permite que
// nada de esto exista en producción hasta que alguien lo encienda.

test("El catálogo trae los 30 tipos, sin repetidos", () => {
  assert.strictEqual(SECTION_KINDS.length, 30);
  assert.strictEqual(new Set(SECTION_KINDS).size, 30);
  for (const k of ["hero", "narrative", "tasks", "quickActions", "emptyState", "error", "portfolio", "watchlist"]) {
    assert.ok(esSectionKind(k), k);
  }
});

test("Lo que no está en el catálogo no es un tipo de sección", () => {
  assert.strictEqual(esSectionKind("iframe"), false);
  assert.strictEqual(esSectionKind("script"), false);
  assert.strictEqual(esSectionKind(42), false);
  assert.strictEqual(esSectionKind(undefined), false);
});

test("Los seis intentos", () => {
  assert.deepStrictEqual([...INTENT_KINDS], ["hoy", "portafolio", "proyecto", "semana", "dinero", "libre"]);
});

test("Sin variables, todo apagado", () => {
  assert.deepStrictEqual(resolverFlags({}), FLAGS_APAGADOS);
});

test("Solo «1» enciende, y se recorta", () => {
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: "1" }).runtime, true);
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: " 1 " }).runtime, true);
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: "true" }).runtime, false);
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: "0" }).runtime, false);
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: "" }).runtime, false);
});

test("Los secundarios no cuentan sin el runtime", () => {
  const f = resolverFlags({
    AGENTIC_GENERATED_SCREENS: "1",
    AGENTIC_LAYOUT_ENGINE: "1",
    AGENTIC_DYNAMIC_NAVIGATION: "1"
  });
  assert.deepStrictEqual(f, FLAGS_APAGADOS);
});

test("Con el runtime encendido, cada secundario va por su cuenta", () => {
  const f = resolverFlags({ AGENTIC_CENTER_RUNTIME: "1", AGENTIC_LAYOUT_ENGINE: "1" });
  assert.deepStrictEqual(f, { runtime: true, pantallasGeneradas: false, layoutEngine: true, navegacionDinamica: false });
});

test("Lo que devuelve resolverFlags no es el objeto compartido", () => {
  const f = resolverFlags({});
  f.runtime = true;
  assert.strictEqual(FLAGS_APAGADOS.runtime, false);
});
