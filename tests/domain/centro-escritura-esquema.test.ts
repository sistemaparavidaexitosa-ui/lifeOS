import { test } from "node:test";
import assert from "node:assert/strict";
import { esquemaParaModelo, indiceDeEscritura, conEscritura } from "../../src/lib/domain/centro/escritura/esquema.ts";
import type { CajaDeHerramientas } from "../../src/lib/domain/ai/tools.ts";

test("esquema_de_tabla: campos, tipos, obligatorios y opciones de una tabla autorizada", () => {
  const e = esquemaParaModelo("food_entries", ["nutrition"]) as { tabla: string; operaciones: string[]; campos: { nombre: string; obligatorioAlCrear: boolean; opciones?: string[] }[] };
  assert.strictEqual(e.tabla, "food_entries");
  assert.deepStrictEqual(e.operaciones, ["crear", "editar", "borrar"]);
  const meal = e.campos.find((c) => c.nombre === "meal");
  assert.deepStrictEqual(meal?.opciones, ["Desayuno", "Almuerzo", "Cena", "Snack"]);
  assert.strictEqual(meal?.obligatorioAlCrear, true);
});

test("esquema_de_tabla: no autorizada e inexistente responden igual", () => {
  assert.deepStrictEqual(esquemaParaModelo("food_entries", ["execution"]), esquemaParaModelo("profiles", ["execution"]));
});

test("El índice nombra cada tabla escribible", () => {
  const i = indiceDeEscritura();
  for (const t of ["tasks", "notes", "food_entries"]) assert.match(i, new RegExp(`\\b${t}\\b`));
});

function cajaFalsa(): CajaDeHerramientas & { llamadas: string[] } {
  const llamadas: string[] = [];
  return {
    llamadas,
    declaraciones: [{ name: "consultar", description: "x", parameters: { type: "OBJECT", properties: {} } }],
    ejecutar: async (name) => {
      llamadas.push(name);
      return { ok: name };
    },
    entregados: () => new Set(),
    filasEntregadas: () => new Map(),
    busquedas: () => []
  };
}

test("conEscritura: añade esquema_de_tabla y delega el resto", async () => {
  const base = cajaFalsa();
  const caja = conEscritura(base, ["execution"]);
  assert.deepStrictEqual(caja.declaraciones.map((d) => d.name), ["consultar", "esquema_de_tabla"]);
  const e = (await caja.ejecutar("esquema_de_tabla", { tabla: "tasks" })) as { tabla: string };
  assert.strictEqual(e.tabla, "tasks");
  assert.deepStrictEqual(await caja.ejecutar("consultar", {}), { ok: "consultar" });
  assert.deepStrictEqual(base.llamadas, ["consultar"]);
});
