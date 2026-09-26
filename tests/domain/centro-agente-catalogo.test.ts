// tests/domain/centro-agente-catalogo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_KINDS, esSectionKind } from "../../src/lib/domain/centro/runtime/secciones.ts";
import { validarScreen } from "../../src/lib/domain/centro/runtime/validador.ts";

const MIO = "11111111-1111-4111-8111-111111111111";
const ctx = { proyectos: [{ id: MIO }] };

function pantalla(sections: unknown[]) {
  return {
    id: "turno",
    intent: "libre",
    title: "Centro",
    layout: { densidad: "aireada" },
    sections,
    actions: [],
    refreshPolicy: { tipo: "alAbrir" },
    permissions: { lectura: true, escritura: false }
  };
}

test("El catálogo trae los seis kinds del agente", () => {
  for (const k of ["lista", "metricas", "irA", "recomendaciones", "insight", "movimientos"]) assert.ok(esSectionKind(k), k);
  assert.strictEqual(SECTION_KINDS.length, 33);
});

const validas: Record<string, unknown> = {
  lista: { titulo: "Hábitos", items: [{ id: "h1", titulo: "Leer", detalle: "3 días", estado: "activo", href: "/development/routines" }] },
  metricas: { titulo: null, items: [{ etiqueta: "Patrimonio", valor: "$18,742.32" }] },
  table: { titulo: "Deudas", columnas: ["Nombre", "Saldo"], filas: [{ id: "d1", celdas: ["Tarjeta", "$4,000.00"], href: "/debt" }] },
  chart: { titulo: "Gasto", tipo: "linea", unidad: "MXN", puntos: [{ x: "2026-09-01", y: 10 }, { x: "2026-09-02", y: 12 }] },
  cards: { titulo: "Libros", items: [{ id: "b1", titulo: "Atomic Habits", detalle: null, href: "/development/library" }] },
  timeline: { titulo: "Hitos", items: [{ id: "t1", fecha: "24 sep 2026", titulo: "Entrega U3", href: `/execution?project=${MIO}` }] },
  irA: { destinos: [{ etiqueta: "Abrir presupuesto", href: "/money/budget" }] },
  recomendaciones: { items: [{ propuestaId: MIO, titulo: "Bloquea 30 min", motivo: "Tu tarde está libre" }] },
  insight: { texto: "NVDA y AVGO siguen siendo tus mejores posiciones." },
  portfolio: { total: "$18,742.32", nota: "Valuación al 12 sep 2026", serie: [{ x: "2026-09-01", y: 1 }, { x: "2026-09-02", y: 2 }] },
  movimientos: { configurado: true, items: [{ ticker: "NVDA", nombre: "NVIDIA", precio: "$118.24", variacion: "+4.32%", tono: "ok", nota: "Sigue fuerte el impulso." }] },
  watchlist: { configurado: false, items: [{ ticker: "NVDA", nombre: "NVIDIA", precio: null, variacion: null, tono: null, serie: [] }] }
};

test("Cada kind del agente acepta su forma resuelta", () => {
  for (const [kind, data] of Object.entries(validas)) {
    const r = validarScreen(pantalla([{ id: `s-${kind}`, kind, data }]), ctx);
    assert.strictEqual(r.ok, true, `${kind}: ${r.ok ? "" : r.reason}`);
  }
});

test("Cada kind del agente es estricto: un campo de más lo tumba", () => {
  for (const [kind, data] of Object.entries(validas)) {
    const r = validarScreen(pantalla([{ id: `s-${kind}`, kind, data: { ...(data as object), extra: 1 } }]), ctx);
    assert.strictEqual(r.ok, false, kind);
  }
});

test("Un enlace de ítem fuera de la app tumba la sección", () => {
  const data = { titulo: "x", items: [{ id: "h1", titulo: "Leer", detalle: null, estado: null, href: "https://evil.example" }] };
  assert.strictEqual(validarScreen(pantalla([{ id: "l", kind: "lista", data }]), ctx).ok, false);
});

test("Los topes: más de 8 ítems en una lista, fuera", () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ id: `h${i}`, titulo: "x", detalle: null, estado: null, href: null }));
  assert.strictEqual(validarScreen(pantalla([{ id: "l", kind: "lista", data: { titulo: "x", items } }]), ctx).ok, false);
});
