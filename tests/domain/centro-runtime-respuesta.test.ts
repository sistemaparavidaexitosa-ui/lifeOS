// tests/domain/centro-runtime-respuesta.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { respuestaDelCentro } from "../../src/lib/domain/centro/runtime/respuesta.ts";
import { FLAGS_APAGADOS, resolverFlags } from "../../src/lib/domain/centro/runtime/flags.ts";
import type { Screen } from "../../src/lib/domain/centro/runtime/types.ts";

const base = { contenido: { x: 1 }, sugerencias: [], resumen: "", costumbre: null };

const screen: Screen = {
  id: "hoy",
  intent: "hoy",
  title: "Centro",
  layout: { densidad: "aireada" },
  sections: [],
  actions: [],
  refreshPolicy: { tipo: "porFranja" },
  permissions: { lectura: true, escritura: false }
};

test("FLAG APAGADO = HOY: la respuesta es campo por campo la de siempre", () => {
  const r = respuestaDelCentro(base, { ...FLAGS_APAGADOS }, null);
  assert.deepStrictEqual(Object.keys(r), ["ok", "contenido", "sugerencias", "resumen", "costumbre"]);
  assert.deepStrictEqual(r, { ok: true, ...base });
});

test("FLAG APAGADO = HOY, aunque alguien pase una pantalla", () => {
  const r = respuestaDelCentro(base, { ...FLAGS_APAGADOS }, screen);
  assert.strictEqual("screen" in r, false);
  assert.strictEqual("flags" in r, false);
});

test("Con el flag, viajan la pantalla y los flags resueltos", () => {
  const flags = resolverFlags({ AGENTIC_CENTER_RUNTIME: "1" });
  const r = respuestaDelCentro(base, flags, screen);
  assert.deepStrictEqual(r, { ok: true, ...base, screen, flags });
});

test("Con el flag y sin pantalla, `screen: null` dice que se intentó y se cayó al lienzo", () => {
  const r = respuestaDelCentro(base, resolverFlags({ AGENTIC_CENTER_RUNTIME: "1" }), null);
  assert.strictEqual("screen" in r && r.screen, null);
});
