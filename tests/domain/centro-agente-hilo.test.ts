import { test } from "node:test";
import assert from "node:assert/strict";
import { agregar, historialParaModelo, MAX_HISTORIAL, type Turno, MAX_TEXTO_HISTORIAL } from "../../src/lib/domain/centro/agente/hilo.ts";

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

// --- I1: lo que el Centro entendió tiene que llegar al modelo, o «Sí, sigue» pierde el ancla.

const confirmarEntendimiento = (entendi: string) => ({
  id: "c",
  kind: "confirmarEntendimiento" as const,
  data: { entendi, seguir: "Sí, sigue", alternativas: [] }
});

test("El «Entendí» de una tarjeta de confirmación viaja pegado al texto del turno", () => {
  const h = agregar([], { id: "t1", rol: "agente", texto: "¿Seguro?", secciones: [confirmarEntendimiento("Borrar la tarea X")] });
  assert.deepStrictEqual(historialParaModelo(h), [{ rol: "agente", texto: "¿Seguro?\n(Entendí: Borrar la tarea X)" }]);
});

test("Si el turno de confirmación no trae texto propio, igual viaja con el «Entendí»", () => {
  const h = agregar([], { id: "t1", rol: "agente", texto: "", secciones: [confirmarEntendimiento("Borrar la tarea X")] });
  assert.deepStrictEqual(historialParaModelo(h), [{ rol: "agente", texto: "(Entendí: Borrar la tarea X)" }]);
});

test("Texto largo + «Entendí»: la entrada nunca pasa del tope que acepta la ruta del turno", () => {
  const entendi = "e".repeat(300);
  const h = agregar([], { id: "t1", rol: "agente", texto: "a".repeat(2000), secciones: [confirmarEntendimiento(entendi)] });
  const [entrada] = historialParaModelo(h);
  assert.ok(entrada!.texto.length <= MAX_TEXTO_HISTORIAL, String(entrada!.texto.length));
  assert.ok(entrada!.texto.endsWith(`(Entendí: ${entendi})`), "lo entendido no se recorta: es lo que ancla «Sí, sigue»");
});
