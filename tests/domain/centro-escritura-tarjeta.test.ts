import { test } from "node:test";
import assert from "node:assert/strict";
import { seccionDeCambios, tituloDeCambio } from "../../src/lib/domain/centro/escritura/tarjeta.ts";
import { validarPorSeccion } from "../../src/lib/domain/centro/runtime/validador.ts";
import type { CambioGuardado } from "../../src/lib/domain/centro/escritura/cambio.ts";

const PID = "99999999-9999-4999-8999-999999999999";
const P = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const filas = new Map<string, Record<string, unknown>>([[`fila:projects:${P}`, { id: P, title: "Tesis" }]]);

const crear: CambioGuardado = { operacion: "crear", tabla: "tasks", id: null, campos: { project_id: P, title: "Escribir intro", priority: "High" }, antes: null };
const editar: CambioGuardado = { operacion: "editar", tabla: "tasks", id: T, campos: { status: "Completed" }, antes: { id: T, title: "Leer", status: "Pending" } };
const borrar: CambioGuardado = { operacion: "borrar", tabla: "tasks", id: T, campos: {}, antes: { id: T, title: "Leer", status: "Pending", priority: "Low", due: null } };

test("Crear: campos con su etiqueta; la ref enseña el nombre de la fila y no se edita", () => {
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: crear }], filas);
  assert.ok(s && s.kind === "propuestaCambio");
  const item = s.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.strictEqual(item?.titulo, "Escribir intro");
  assert.strictEqual(item?.etiquetaTabla, "Tarea");
  assert.deepStrictEqual(item?.campos.find((c) => c.campo === "project_id"), {
    campo: "project_id", etiqueta: "Proyecto", tipo: "ref", antes: null, despues: "Tesis", editable: false, opciones: null
  });
  assert.deepStrictEqual(item?.campos.find((c) => c.campo === "priority"), {
    campo: "priority", etiqueta: "Prioridad", tipo: "opcion", antes: null, despues: "High", editable: true, opciones: ["High", "Medium", "Low"]
  });
});

test("Editar: antes → después; el título sale de la fila leída", () => {
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: editar }], filas);
  const item = s?.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.strictEqual(item?.titulo, "Leer");
  assert.deepStrictEqual(item?.campos, [
    { campo: "status", etiqueta: "Estado", tipo: "opcion", antes: "Pending", despues: "Completed", editable: true, opciones: ["Pending", "InProgress", "Blocked", "Rescheduled", "Completed", "Cancelled"] }
  ]);
});

test("Borrar: la fila entera (campos del registro presentes), nada editable", () => {
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: borrar }], filas);
  const item = s?.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.deepStrictEqual(item?.campos.map((c) => [c.campo, c.antes, c.despues, c.editable]), [
    ["title", "Leer", null, false],
    ["status", "Pending", null, false],
    ["priority", "Low", null, false]
  ]);
});

test("La sección pasa el validador del runtime", () => {
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: crear }, { propuestaId: PID.replace(/9/g, "8"), cambio: editar }], filas);
  assert.ok(s);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Marcado en un campo: la tarjeta lo neutraliza y sigue pasando el validador (Review Focus 2)", () => {
  const nota: CambioGuardado = { operacion: "crear", tabla: "notes", id: null, campos: { notebook_id: P, title: "<b>Hola</b>", body: "<div>texto</div>" }, antes: null };
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: nota }], new Map([[`fila:notebooks:${P}`, { id: P, title: "Ideas" }]]));
  assert.ok(s);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
  const item = s.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.ok(!item?.titulo.includes("<b>"));
});

test("Título larguísimo: recortado a 90; sin título, la primera línea del cuerpo (Review Focus 5)", () => {
  const largo: CambioGuardado = { operacion: "crear", tabla: "notes", id: null, campos: { notebook_id: P, title: null, body: "x".repeat(5000) }, antes: null };
  const t = tituloDeCambio(largo);
  assert.ok(t.length <= 90, String(t.length));
  assert.ok(t.startsWith("xxx"));
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: largo }], filas);
  assert.ok(s);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Sin items, no hay sección", () => {
  assert.strictEqual(seccionDeCambios("b0", [], filas), null);
});

test("Borrar: una ref (proyecto) enseña el nombre leído, no el uuid crudo (M1)", () => {
  const borrarConRef: CambioGuardado = { operacion: "borrar", tabla: "tasks", id: T, campos: {}, antes: { id: T, title: "Leer", project_id: P } };
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: borrarConRef }], filas);
  const item = s?.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.deepStrictEqual(item?.campos.find((c) => c.campo === "project_id"), {
    campo: "project_id", etiqueta: "Proyecto", tipo: "ref", antes: "Tesis", despues: null, editable: false, opciones: null
  });
});

test("Borrar: una ref cuya fila no se leyó en el turno cae a null, no al uuid (M1)", () => {
  const borrarSinLeer: CambioGuardado = {
    operacion: "borrar",
    tabla: "tasks",
    id: T,
    campos: {},
    antes: { id: T, title: "Leer", project_id: "77777777-7777-4777-8777-777777777777" }
  };
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: borrarSinLeer }], filas);
  const item = s?.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.strictEqual(item?.campos.find((c) => c.campo === "project_id")?.antes, null);
});

test("Editar: un cuerpo con salto de línea no es editable — lo que se ve ya no es lo que se guardó (I1)", () => {
  const editarBody: CambioGuardado = {
    operacion: "editar",
    tabla: "notes",
    id: T,
    campos: { body: "Primera línea\nSegunda línea" },
    antes: { id: T, title: "Nota", body: "Antes" }
  };
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: editarBody }], filas);
  const item = s?.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.strictEqual(item?.campos.find((c) => c.campo === "body")?.editable, false);
});

test("Editar: un cuerpo de más de 400 caracteres se recorta y por eso no es editable (I1)", () => {
  const editarBody: CambioGuardado = {
    operacion: "editar",
    tabla: "notes",
    id: T,
    campos: { body: "x".repeat(500) },
    antes: { id: T, title: "Nota", body: "Antes" }
  };
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: editarBody }], filas);
  const item = s?.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.strictEqual(item?.campos.find((c) => c.campo === "body")?.editable, false);
});

test("Editar: un título corto y sin marcado sigue siendo editable (I1)", () => {
  const editarTitulo: CambioGuardado = {
    operacion: "editar",
    tabla: "notes",
    id: T,
    campos: { title: "Título corto" },
    antes: { id: T, title: "Otro", body: "Cuerpo" }
  };
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: editarTitulo }], filas);
  const item = s?.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.strictEqual(item?.campos.find((c) => c.campo === "title")?.editable, true);
});
