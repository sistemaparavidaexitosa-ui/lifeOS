// tests/domain/centro-agente-resolver.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverBloque, rutaDeFila, formatear, proyectosVistos } from "../../src/lib/domain/centro/agente/resolver.ts";
import { tieneCifras } from "../../src/lib/domain/centro/agente/texto.ts";

const P = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const D = "33333333-3333-4333-8333-333333333333";
const N = "44444444-4444-4444-8444-444444444444";

const filas = new Map<string, Record<string, unknown>>([
  [`fila:projects:${P}`, { id: P, name: "Malpaso", status: "active" }],
  [`fila:tasks:${T}`, { id: T, title: "Revisar U3", project_id: P, due_date: "2026-09-26", status: "working" }],
  [`fila:debts:${D}`, { id: D, name: "Tarjeta", balance: 4000 }],
  [`fila:notes:${N}`, { id: N, title: "Idea" }]
]);
const ctx = { filas, moneda: "MXN", locale: "es-MX" };

test("Los proyectos vistos salen de las filas de proyectos y de las tareas", () => {
  assert.deepStrictEqual(proyectosVistos(filas), [{ id: P }]);
});

test("Cada tabla va a su sección; lo que no está en el menú, sin enlace", () => {
  const pv = proyectosVistos(filas);
  assert.strictEqual(rutaDeFila(`fila:tasks:${T}`, filas.get(`fila:tasks:${T}`)!, pv), `/execution?project=${P}`);
  assert.strictEqual(rutaDeFila(`fila:projects:${P}`, filas.get(`fila:projects:${P}`)!, pv), `/execution?project=${P}`);
  assert.strictEqual(rutaDeFila(`fila:debts:${D}`, {}, pv), "/debt");
  assert.strictEqual(rutaDeFila(`fila:habits:x`, {}, pv), "/development/routines");
  assert.strictEqual(rutaDeFila(`fila:notes:${N}`, {}, pv), null);
  assert.strictEqual(rutaDeFila(`fila:tablainventada:x`, {}, pv), null);
});

test("Una tarea de un proyecto que no se vio va a /execution a secas", () => {
  assert.strictEqual(rutaDeFila(`fila:tasks:x`, { project_id: "99999999-9999-4999-8999-999999999999" }, [{ id: P }]), "/execution");
});

test("Formatos", () => {
  assert.strictEqual(formatear(4000, "dinero", "MXN", "es-MX"), "$4,000.00");
  assert.strictEqual(formatear(12.345, "porcentaje", "MXN", "es-MX"), "12.3%");
  assert.strictEqual(formatear("2026-09-26", "fecha", "MXN", "es-MX"), "26 sep 2026");
  assert.strictEqual(formatear(1234.5, "numero", "MXN", "es-MX"), "1,234.5");
  assert.strictEqual(formatear(null, "numero", "MXN", "es-MX"), null);
  assert.strictEqual(formatear("abc", "dinero", "MXN", "es-MX"), null);
  assert.strictEqual(formatear("  hola  ", "texto", "MXN", "es-MX"), "hola");
});

test("Una lista se resuelve contra las filas leídas", () => {
  const s = resolverBloque(
    { kind: "lista", titulo: "Pendiente", items: [{ fila: `fila:tasks:${T}`, titulo: "title", detalle: "due_date", estado: "status" }] },
    "b0",
    ctx
  );
  assert.deepStrictEqual(s, {
    id: "b0",
    kind: "lista",
    data: { titulo: "Pendiente", items: [{ id: T, titulo: "Revisar U3", detalle: "26 sep 2026", estado: "working", href: `/execution?project=${P}` }] }
  });
});

test("Una fila que no se leyó no sale (y si no queda nada, el bloque tampoco)", () => {
  const s = resolverBloque(
    { kind: "lista", titulo: "x", items: [{ fila: "fila:debts:99999999-9999-4999-8999-999999999999", titulo: "name", detalle: null, estado: null }] },
    "b0",
    ctx
  );
  assert.strictEqual(s, null);
});

test("Un campo que la fila no tiene invalida ese ítem", () => {
  const s = resolverBloque(
    {
      kind: "lista",
      titulo: "x",
      items: [
        { fila: `fila:debts:${D}`, titulo: "nombre_que_no_existe", detalle: null, estado: null },
        { fila: `fila:debts:${D}`, titulo: "name", detalle: null, estado: null }
      ]
    },
    "b0",
    ctx
  );
  assert.strictEqual(s?.kind === "lista" ? s.data.items.length : -1, 1);
});

test("Métricas: el valor sale de la fila y con formato", () => {
  const s = resolverBloque(
    { kind: "metricas", titulo: null, items: [{ etiqueta: "Deuda", fila: `fila:debts:${D}`, campo: "balance", formato: "dinero" }] },
    "b1",
    ctx
  );
  assert.deepStrictEqual(s?.data, { titulo: null, items: [{ etiqueta: "Deuda", valor: "$4,000.00" }] });
});

test("Tabla: columnas por campo, filas por referencia", () => {
  const s = resolverBloque(
    {
      kind: "tabla",
      titulo: "Deudas",
      columnas: [{ etiqueta: "Nombre", campo: "name", formato: "texto" }, { etiqueta: "Saldo", campo: "balance", formato: "dinero" }],
      filas: [`fila:debts:${D}`]
    },
    "b2",
    ctx
  );
  assert.deepStrictEqual(s, {
    id: "b2",
    kind: "table",
    data: { titulo: "Deudas", columnas: ["Nombre", "Saldo"], filas: [{ id: D, celdas: ["Tarjeta", "$4,000.00"], href: "/debt" }] }
  });
});

test("Gráfica: todas de la misma tabla, y al menos dos puntos numéricos", () => {
  const m = new Map<string, Record<string, unknown>>([
    ["fila:net_worth_snapshots:a", { id: "a", as_of: "2026-09-01", net: 100 }],
    ["fila:net_worth_snapshots:b", { id: "b", as_of: "2026-09-02", net: 110 }]
  ]);
  const b = { kind: "grafica" as const, titulo: "Patrimonio", tipo: "linea" as const, campoX: "as_of", campoY: "net", formato: "dinero" as const, filas: ["fila:net_worth_snapshots:a", "fila:net_worth_snapshots:b"] };
  const s = resolverBloque(b, "g", { filas: m, moneda: "MXN", locale: "es-MX" });
  assert.deepStrictEqual(s?.data, { titulo: "Patrimonio", tipo: "linea", unidad: "MXN", puntos: [{ x: "2026-09-01", y: 100 }, { x: "2026-09-02", y: 110 }] });
  const mezclada = resolverBloque({ ...b, filas: ["fila:net_worth_snapshots:a", `fila:debts:${D}`] }, "g", { ...ctx, filas: new Map([...m, ...filas]) });
  assert.strictEqual(mezclada, null);
});

test("Cifras en texto libre", () => {
  assert.strictEqual(tieneCifras("Te ahorras $3,000 al mes"), true);
  assert.strictEqual(tieneCifras("Subió 4.3%"), true);
  assert.strictEqual(tieneCifras("Son 200 pesos"), true);
  assert.strictEqual(tieneCifras("Tienes 3 tareas vencidas"), false);
  assert.strictEqual(tieneCifras("NVDA y AVGO siguen fuertes"), false);
});
