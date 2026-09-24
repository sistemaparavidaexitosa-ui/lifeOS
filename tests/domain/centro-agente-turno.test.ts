// tests/domain/centro-agente-turno.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { componerTurno, prefijarSecciones } from "../../src/lib/domain/centro/agente/turno.ts";

const P = "11111111-1111-4111-8111-111111111111";

test("Solo texto cuando no hay bloques", () => {
  assert.deepStrictEqual(componerTurno({ texto: "Hola", secciones: [], proyectos: [] }), { texto: "Hola", secciones: [] });
});

test("Un insight con cifras se cae, el resto se queda", () => {
  const r = componerTurno({
    texto: "x",
    secciones: [
      { id: "b0", kind: "insight", data: { texto: "Ahorras $3,000" } },
      { id: "b1", kind: "irA", data: { destinos: [{ etiqueta: "Presupuesto", href: "/money/budget" }] } }
    ],
    proyectos: []
  });
  assert.deepStrictEqual(r.secciones.map((s) => s.kind), ["irA"]);
});

test("Si la pantalla no valida, queda solo el texto", () => {
  const r = componerTurno({
    texto: "x",
    secciones: [{ id: "b0", kind: "irA", data: { destinos: [{ etiqueta: "Fuera", href: "https://evil.example" }] } }],
    proyectos: []
  });
  assert.deepStrictEqual(r, { texto: "x", secciones: [] });
});

test("Enlaces a tus proyectos pasan", () => {
  const r = componerTurno({
    texto: "x",
    secciones: [{ id: "b0", kind: "irA", data: { destinos: [{ etiqueta: "Malpaso", href: `/execution?project=${P}` }] } }],
    proyectos: [{ id: P }]
  });
  assert.strictEqual(r.secciones.length, 1);
});

test("prefijarSecciones antepone el prefijo del bloque a cada id de sección", () => {
  const r = prefijarSecciones(
    [{ id: "mercado-watchlist", kind: "emptyState", data: { mensaje: "x" } } as const],
    "b0"
  );
  assert.deepStrictEqual(r.map((s) => s.id), ["b0-mercado-watchlist"]);
});

test("Dos capacidades con el mismo id de sección no chocan si cada una lleva el prefijo de SU bloque", () => {
  const deLaPrimera = prefijarSecciones([{ id: "mercado-watchlist", kind: "emptyState", data: { mensaje: "x" } } as const], "b0");
  const deLaSegunda = prefijarSecciones([{ id: "mercado-watchlist", kind: "emptyState", data: { mensaje: "y" } } as const], "b1");
  const r = componerTurno({ texto: "x", secciones: [...deLaPrimera, ...deLaSegunda], proyectos: [] });
  assert.strictEqual(r.secciones.length, 2);
});

// --- C1: la sección de «Hoy» enlaza proyectos que vio SU grafo; una sección mala no tumba las demás.

test("Una sección tasks que enlaza un proyecto presente en `proyectos` sobrevive", () => {
  const r = componerTurno({
    texto: "x",
    secciones: [
      {
        id: "b0-hoy-tareas",
        kind: "tasks",
        data: { fechaISO: "2026-09-24", items: [{ id: "t1", titulo: "Revisar U3", contexto: "Malpaso", href: `/execution?project=${P}` }] }
      }
    ],
    proyectos: [{ id: P }]
  });
  assert.deepStrictEqual(r.secciones.map((s) => s.id), ["b0-hoy-tareas"]);
});

test("Una sección mala junto a una buena: solo se cae la mala", () => {
  const r = componerTurno({
    texto: "x",
    secciones: [
      { id: "b0", kind: "irA", data: { destinos: [{ etiqueta: "Fuera", href: "https://evil.example" }] } },
      { id: "b1", kind: "irA", data: { destinos: [{ etiqueta: "Presupuesto", href: "/money/budget" }] } },
      { id: "b2", kind: "tasks", data: { fechaISO: "2026-09-24", items: [{ id: "t1", titulo: "X", contexto: null, href: "/execution?project=99999999-9999-4999-8999-999999999999" }] } }
    ],
    proyectos: [{ id: P }]
  });
  assert.deepStrictEqual(r.secciones.map((s) => s.id), ["b1"]);
});

test("Dos secciones con el mismo id: sale la primera, no se cae el turno", () => {
  const r = componerTurno({
    texto: "x",
    secciones: [
      { id: "b0", kind: "insight", data: { texto: "Uno." } },
      { id: "b0", kind: "insight", data: { texto: "Dos." } }
    ],
    proyectos: []
  });
  assert.deepStrictEqual(r.secciones.map((s) => s.kind === "insight" && s.data.texto), ["Uno."]);
});
