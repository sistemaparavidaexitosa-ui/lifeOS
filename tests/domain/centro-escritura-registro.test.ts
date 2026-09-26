import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESCRITURA_POR_TABLA,
  TABLAS_PROHIBIDAS,
  entradaDe,
  camposDe,
  type EntradaDeEscritura
} from "../../src/lib/domain/centro/escritura/registro.ts";
import { TABLAS_CONSULTABLES, dominioDeTabla } from "../../src/lib/insights/context.ts";

const tablas = Object.keys(ESCRITURA_POR_TABLA);
// Sin `as const`: iterar la unión de literales no compila al leer campos opcionales.
const REGISTRO = ESCRITURA_POR_TABLA as Record<string, EntradaDeEscritura>;

test("Ninguna tabla prohibida está en el registro (profiles, sobre todo)", () => {
  assert.ok(TABLAS_PROHIBIDAS.includes("profiles"));
  for (const t of TABLAS_PROHIBIDAS) assert.ok(!tablas.includes(t), t);
});

test("Entrega 1: tasks, notes y food_entries", () => {
  assert.deepStrictEqual(tablas.sort(), ["food_entries", "notes", "tasks"]);
});

test("El dominio de cada tabla es el de la lista blanca de lectura", () => {
  for (const [t, e] of Object.entries(REGISTRO)) {
    assert.strictEqual(e.dominio, dominioDeTabla(t), t);
  }
});

test("El título de la tarjeta es un campo del registro, y cada ref apunta a una tabla legible", () => {
  for (const [t, e] of Object.entries(REGISTRO)) {
    assert.ok(e.titulo in e.campos, `${t}.titulo`);
    for (const [n, c] of Object.entries(e.campos)) {
      if (c.tipo === "ref") assert.ok(c.refTabla && c.refTabla in TABLAS_CONSULTABLES, `${t}.${n}`);
      if (c.tipo === "opcion") assert.ok(c.opciones && c.opciones.length > 0, `${t}.${n}`);
    }
  }
});

test("Ningún campo de identidad o autoría es escribible", () => {
  for (const [t, e] of Object.entries(REGISTRO)) {
    for (const prohibido of ["id", "user_id", "workspace_id", "created_by", "updated_by", "version", "created_at"]) {
      assert.ok(!(prohibido in e.campos), `${t}.${prohibido}`);
    }
  }
});

test("entradaDe: un dominio apagado y una tabla inexistente dan lo mismo", () => {
  assert.strictEqual(entradaDe("tasks", ["nutrition"]), null);
  assert.strictEqual(entradaDe("profiles", ["execution", "nutrition"]), null);
  assert.strictEqual(entradaDe("tasks", ["execution"])?.tabla, "tasks");
});

test("camposDe: soloCrear no se edita; soloEditar no se crea", () => {
  const e = ESCRITURA_POR_TABLA.tasks;
  const crear = camposDe(e, "crear").map(([n]) => n);
  const editar = camposDe(e, "editar").map(([n]) => n);
  assert.ok(crear.includes("project_id") && !editar.includes("project_id"));
  assert.ok(editar.includes("status") && !crear.includes("status"));
});
