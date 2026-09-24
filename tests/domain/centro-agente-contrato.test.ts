// tests/domain/centro-agente-contrato.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearRespuesta, ESQUEMA_RESPUESTA, MAX_BLOQUES } from "../../src/lib/domain/centro/agente/contrato.ts";

const F = "fila:habits:11111111-1111-4111-8111-111111111111";
const b = (kind: string, datos: unknown) => ({ kind, datos: typeof datos === "string" ? datos : JSON.stringify(datos) });

test("Un turno solo con texto es válido", () => {
  const r = parsearRespuesta({ texto: "Vas bien.", bloques: [] });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value, { texto: "Vas bien.", bloques: [], descartados: [] });
});

test("Sin texto no hay turno", () => {
  assert.strictEqual(parsearRespuesta({ texto: "  ", bloques: [] }).ok, false);
  assert.strictEqual(parsearRespuesta(null).ok, false);
  assert.strictEqual(parsearRespuesta({ bloques: [] }).ok, false);
});

test("Una lista anclada a filas se parsea", () => {
  const r = parsearRespuesta({
    texto: "Tus hábitos",
    bloques: [b("lista", { titulo: "Hábitos", items: [{ fila: F, titulo: "name", detalle: null, estado: null }] })]
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques[0], {
    kind: "lista",
    titulo: "Hábitos",
    items: [{ fila: F, titulo: "name", detalle: null, estado: null }]
  });
});

test("Un bloque roto se descarta con motivo y el resto sigue", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [b("lista", "{no es json"), b("insight", { texto: "Bien." }), b("volar", {})]
  });
  assert.ok(r.ok);
  assert.strictEqual(r.ok && r.value.bloques.length, 1);
  assert.strictEqual(r.ok && r.value.descartados.length, 2);
});

test("Una fila con forma rara no pasa: el ancla tiene que ser fila:<tabla>:<id>", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [b("lista", { titulo: "x", items: [{ fila: "habits/1", titulo: "name", detalle: null, estado: null }] })]
  });
  assert.strictEqual(r.ok && r.value.bloques.length, 0);
});

test("Un campo tiene que ser un nombre de columna, no una expresión", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [b("metricas", { titulo: null, items: [{ etiqueta: "x", fila: F, campo: "balance * 2", formato: "numero" }] })]
  });
  assert.strictEqual(r.ok && r.value.bloques.length, 0);
});

test("Como mucho cuatro bloques: el resto se descarta", () => {
  const cinco = Array.from({ length: 5 }, () => b("insight", { texto: "Bien." }));
  const r = parsearRespuesta({ texto: "x", bloques: cinco });
  assert.strictEqual(r.ok && r.value.bloques.length, MAX_BLOQUES);
  assert.strictEqual(r.ok && r.value.descartados.length, 1);
});

test("Capacidades: mercado y hoy pasan con sus parámetros crudos", () => {
  const r = parsearRespuesta({ texto: "x", bloques: [b("mercado", { vista: "watchlist" }), b("hoy", {})] });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques, [
    { kind: "capacidad", nombre: "mercado", parametros: { vista: "watchlist" } },
    { kind: "capacidad", nombre: "hoy", parametros: {} }
  ]);
});

test("Recomendaciones: solo tipos que el Centro sabe proponer", () => {
  const ok = parsearRespuesta({ texto: "x", bloques: [b("recomendaciones", { items: [{ tipo: "tarea", titulo: "Llamar", motivo: "Hoy", datos: "{}" }] })] });
  assert.strictEqual(ok.ok && ok.value.bloques.length, 1);
  const mal = parsearRespuesta({ texto: "x", bloques: [b("recomendaciones", { items: [{ tipo: "arista", titulo: "x", motivo: "y", datos: "{}" }] })] });
  assert.strictEqual(mal.ok && mal.value.bloques.length, 0);
});

test("El esquema de Gemini pide texto y bloques con kind cerrado y datos en texto", () => {
  assert.strictEqual(ESQUEMA_RESPUESTA.type, "OBJECT");
  assert.deepStrictEqual(ESQUEMA_RESPUESTA.required, ["texto", "bloques"]);
  const item = ESQUEMA_RESPUESTA.properties?.bloques?.items;
  assert.ok(item?.properties?.kind?.enum?.includes("lista"));
  assert.ok(item?.properties?.kind?.enum?.includes("mercado"));
  assert.strictEqual(item?.properties?.datos?.type, "STRING");
});
