import { test } from "node:test";
import assert from "node:assert/strict";
import { agregar, historialParaModelo, MAX_HISTORIAL, type Turno } from "../../src/lib/domain/centro/agente/hilo.ts";

const t = (i: number, rol: Turno["rol"]): Turno => ({ id: `t${i}`, rol, texto: `m${i}`, secciones: [] });

test("Agregar no muta el hilo anterior", () => {
  const a: Turno[] = [];
  const b = agregar(a, t(1, "persona"));
  assert.strictEqual(a.length, 0);
  assert.strictEqual(b.length, 1);
});

test("Al modelo solo viaja el texto de los últimos turnos", () => {
  let h: Turno[] = [];
  for (let i = 0; i < 20; i++) h = agregar(h, { ...t(i, i % 2 ? "agente" : "persona"), secciones: [{ id: "x", kind: "insight", data: { texto: "x" } }] });
  const hist = historialParaModelo(h);
  assert.strictEqual(hist.length, MAX_HISTORIAL);
  assert.deepStrictEqual(hist[hist.length - 1], { rol: "agente", texto: "m19" });
  assert.ok(hist.every((m) => Object.keys(m).join() === "rol,texto"));
});

test("El turno de «Hoy» (sin texto) no viaja", () => {
  const h = agregar([], { id: "hoy", rol: "agente", texto: "", secciones: [] });
  assert.deepStrictEqual(historialParaModelo(h), []);
});
