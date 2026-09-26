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
  const bloques_exceso = Array.from({ length: MAX_BLOQUES + 1 }, () => b("insight", { texto: "Bien." }));
  const r = parsearRespuesta({ texto: "x", bloques: bloques_exceso });
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

// --- I5: las cifras tampoco van en títulos ni etiquetas.

test("Un título con cifras tira el bloque; un conteo suelto pasa", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [
      b("lista", { titulo: "Ahorraste $3,000", items: [{ fila: F, titulo: "name", detalle: null, estado: null }] }),
      b("lista", { titulo: "Top 5 tareas", items: [{ fila: F, titulo: "name", detalle: null, estado: null }] })
    ]
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques.map((x) => "titulo" in x && x.titulo), ["Top 5 tareas"]);
  assert.strictEqual(r.ok && r.value.descartados.length, 1);
});

test("Etiquetas con cifras (métricas, columnas, ir_a) tiran el bloque", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [
      b("metricas", { titulo: null, items: [{ etiqueta: "Meta MXN 3,000", fila: F, campo: "name", formato: "texto" }] }),
      b("tabla", { titulo: "Hábitos", columnas: [{ etiqueta: "Sube 4%", campo: "name", formato: "texto" }], filas: [F] }),
      b("ir_a", { destinos: [{ etiqueta: "Ahorra $500", href: "/money" }] })
    ]
  });
  assert.ok(r.ok);
  assert.strictEqual(r.ok && r.value.bloques.length, 0);
  assert.strictEqual(r.ok && r.value.descartados.length, 3);
});

test("propuesta_cambio: 1–5 cambios; la forma fina se valida después, contra las filas", () => {
  const b = (datos: unknown) => ({ kind: "propuesta_cambio", datos: JSON.stringify(datos) });
  const uno = parsearRespuesta({ texto: "¿Lo guardo?", bloques: [b({ cambios: [{ operacion: "crear", tabla: "tasks", campos: { title: "X" } }] })] });
  assert.ok(uno.ok);
  assert.deepStrictEqual(uno.ok && uno.value.bloques[0], { kind: "propuesta_cambio", cambios: [{ operacion: "crear", tabla: "tasks", campos: { title: "X" } }] });
  const seis = parsearRespuesta({ texto: "x", bloques: [b({ cambios: Array.from({ length: 6 }, () => ({ operacion: "borrar", fila: "fila:tasks:1" })) })] });
  assert.strictEqual(seis.ok && seis.value.bloques.length, 0);
  const mala = parsearRespuesta({ texto: "x", bloques: [b({ cambios: [{ operacion: "truncar" }] })] });
  assert.strictEqual(mala.ok && mala.value.bloques.length, 0);
});

const blq = (kind: string, datos: unknown) => ({ kind, datos: JSON.stringify(datos) });
const CONF = { entendi: "Quieres registrar la avena y mover «Leer» a mañana.", seguir: "Sí, hazlo", alternativas: [{ etiqueta: "Solo la comida", texto: "Solo registra la avena" }, { etiqueta: "Otra cosa", texto: null }] };

test("confirmar_entendimiento: bien formado pasa tal cual", () => {
  const r = parsearRespuesta({ texto: "Antes de seguir:", bloques: [blq("confirmar_entendimiento", CONF)] });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques, [{ kind: "confirmar_entendimiento", ...CONF }]);
});

test("confirmar_entendimiento: límites y marcado", () => {
  for (const malo of [
    { ...CONF, entendi: "" },
    { ...CONF, entendi: "x".repeat(301) },
    { ...CONF, seguir: "x".repeat(41) },
    { ...CONF, alternativas: [1, 2, 3, 4].map(() => ({ etiqueta: "a", texto: null })) },
    { ...CONF, alternativas: [{ etiqueta: "", texto: null }] }
  ]) {
    const r = parsearRespuesta({ texto: "x", bloques: [blq("confirmar_entendimiento", malo)] });
    assert.strictEqual(r.ok && r.value.bloques.length, 0, JSON.stringify(malo).slice(0, 80));
  }
});

test("Confirmación y propuestas en el mismo turno: solo la confirmación (Review Focus 1)", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [blq("propuesta_cambio", { cambios: [{ operacion: "crear", tabla: "tasks", campos: { title: "X" } }] }), blq("confirmar_entendimiento", CONF)]
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques.map((b) => b.kind), ["confirmar_entendimiento"]);
  assert.ok(r.ok && r.value.descartados.some((d) => d.includes("pregunta primero")));
});

test("Confirmación y una propuesta de movimiento en el mismo turno: solo la confirmación (I2)", () => {
  const MOV = { fila: "fila:investments:11111111-1111-4111-8111-111111111111", tipo: "aportacion", monto: 500, fecha: null, nota: null };
  const r = parsearRespuesta({
    texto: "x",
    bloques: [blq("propuesta_movimiento", MOV), blq("confirmar_entendimiento", CONF)]
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques.map((b) => b.kind), ["confirmar_entendimiento"]);
  assert.ok(r.ok && r.value.descartados.some((d) => d.includes("propuesta_movimiento") && d.includes("pregunta primero")));
});

test("recordar: bien formado; ámbito fuera de la lista, vacío, largo o con cifras: fuera", () => {
  const ok = parsearRespuesta({ texto: "x", bloques: [blq("recordar", { texto: "Prefiere registrar comidas en gramos", ambito: "preference" })] });
  assert.deepStrictEqual(ok.ok && ok.value.bloques, [{ kind: "recordar", texto: "Prefiere registrar comidas en gramos", ambito: "preference" }]);
  for (const malo of [
    { texto: "x", ambito: "gustos" },
    { texto: "", ambito: "preference" },
    { texto: "x".repeat(201), ambito: "preference" },
    { texto: "Ahorra $3,000 al mes", ambito: "finance" }
  ]) {
    const r = parsearRespuesta({ texto: "x", bloques: [blq("recordar", malo)] });
    assert.strictEqual(r.ok && r.value.bloques.length, 0, JSON.stringify(malo));
  }
});

test("Dos recordar o dos confirmaciones: solo el primero (Review Focus 2)", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [
      blq("recordar", { texto: "Uno", ambito: "preference" }),
      blq("recordar", { texto: "Dos", ambito: "preference" }),
      blq("confirmar_entendimiento", CONF),
      blq("confirmar_entendimiento", { ...CONF, entendi: "Otra" })
    ]
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques.map((b) => (b.kind === "recordar" ? b.texto : b.kind === "confirmar_entendimiento" ? b.entendi : b.kind)), ["Uno", CONF.entendi]);
});

test("Texto hasta 2000 caracteres", () => {
  const r = parsearRespuesta({ texto: "a".repeat(2500), bloques: [] });
  assert.strictEqual(r.ok && r.value.texto.length, 2000);
});
