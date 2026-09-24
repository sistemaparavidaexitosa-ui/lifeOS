// tests/domain/centro-runtime-validador.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarScreen, MAX_SECCIONES } from "../../src/lib/domain/centro/runtime/validador.ts";
import { sanearAccion } from "../../src/lib/domain/centro/runtime/acciones.ts";

// La frontera con lo que mañana escribirá un modelo. Hoy la cruza lo que arma
// el servidor; la regla es la misma.

const MIO = "11111111-1111-4111-8111-111111111111";
const AJENO = "99999999-9999-4999-8999-999999999999";
const ctx = { proyectos: [{ id: MIO }] };

function valida(): Record<string, unknown> {
  return {
    id: "hoy",
    intent: "hoy",
    title: "Centro",
    layout: { densidad: "aireada" },
    sections: [
      { id: "hero", kind: "hero", data: { saludo: "Buenos días", nombre: "Luis", fechaISO: "2026-09-24", frase: null } },
      {
        id: "foco",
        kind: "tasks",
        title: "Tu foco de hoy",
        data: {
          fechaISO: "2026-09-24",
          items: [{ id: "t1", titulo: "Revisar avances U3", contexto: "Proyecto · Malpaso", href: `/execution?project=${MIO}` }]
        }
      },
      {
        id: "sigue",
        kind: "quickActions",
        title: "Sigue por aquí",
        data: { items: [{ etiqueta: "Proyectos", detalle: "3 en el plan", href: "/execution", icono: "proyectos" }] }
      }
    ],
    actions: [],
    refreshPolicy: { tipo: "porFranja" },
    permissions: { lectura: true, escritura: false }
  };
}

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function con(cambio: (s: Mutable) => void): Mutable {
  const s = structuredClone(valida()) as Mutable;
  cambio(s);
  return s;
}

test("Una pantalla bien hecha pasa", () => {
  const r = validarScreen(valida(), ctx);
  assert.strictEqual(r.ok, true);
});

test("Marcado en un texto: fuera", () => {
  const r = validarScreen(con((s) => (s.sections[0].data.frase = "<script>alert(1)</script>")), ctx);
  assert.strictEqual(r.ok, false);
  assert.match(!r.ok ? r.reason : "", /marcado/);
});

test("JSX en un texto: fuera", () => {
  const r = validarScreen(con((s) => s.sections.push({ id: "t", kind: "text", data: { texto: "<Hero />" } })), ctx);
  assert.strictEqual(r.ok, false);
});

test("Texto del usuario con marcado: se rechaza la pantalla y el Centro cae al lienzo", () => {
  const r = validarScreen(con((s) => (s.sections[1].data.items[0].titulo = "Migrar <Header> a v2")), ctx);
  assert.strictEqual(r.ok, false);
});

test("Un «menor que» no es marcado", () => {
  const r = validarScreen(con((s) => s.sections.push({ id: "t", kind: "text", data: { texto: "gasto < ingreso, y 3 <3" } })), ctx);
  assert.strictEqual(r.ok, true);
});

test("Un tipo de sección que no está en el catálogo: fuera", () => {
  const r = validarScreen(con((s) => s.sections.push({ id: "x", kind: "iframe", data: {} })), ctx);
  assert.strictEqual(r.ok, false);
});

test("Un tipo sin componente todavía, con datos, es legal", () => {
  const r = validarScreen(
    con((s) => s.sections.push({ id: "p", kind: "portfolio", data: { moneda: "USD", total: null, variacionPct: null, posiciones: [] } })),
    ctx
  );
  assert.strictEqual(r.ok, true);
});

test("Enlaces fuera de la aplicación: fuera", () => {
  for (const href of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/inventado"]) {
    const r = validarScreen(con((s) => (s.sections[2].data.items[0].href = href)), ctx);
    assert.strictEqual(r.ok, false, href);
  }
});

test("Un proyecto que no es tuyo: fuera", () => {
  const r = validarScreen(con((s) => (s.sections[1].data.items[0].href = `/execution?project=${AJENO}`)), ctx);
  assert.strictEqual(r.ok, false);
});

test("Datos con campos de más: fuera", () => {
  const r = validarScreen(con((s) => (s.sections[0].data.onClick = "x")), ctx);
  assert.strictEqual(r.ok, false);
});

test("Pedir escritura: fuera", () => {
  const r = validarScreen(con((s) => (s.permissions.escritura = true)), ctx);
  assert.strictEqual(r.ok, false);
});

test("Dos secciones con el mismo id: fuera", () => {
  const r = validarScreen(con((s) => s.sections.push({ ...s.sections[0] })), ctx);
  assert.strictEqual(r.ok, false);
  assert.match(!r.ok ? r.reason : "", /repetida/);
});

test("Demasiadas secciones: fuera", () => {
  const r = validarScreen(
    con((s) => {
      s.sections = Array.from({ length: MAX_SECCIONES + 1 }, (_, i) => ({ id: `t${i}`, kind: "text", data: { texto: "x" } }));
    }),
    ctx
  );
  assert.strictEqual(r.ok, false);
});

test("Lo que no es una pantalla: fuera, sin lanzar", () => {
  for (const v of [null, undefined, "hola", 42, [], {}]) {
    assert.strictEqual(validarScreen(v, ctx).ok, false);
  }
});

test("Acciones: un enlace válido o un intento del catálogo", () => {
  const r = validarScreen(
    con((s) => (s.actions = [{ label: "Volver a hoy", intent: "hoy" }, { label: "Dinero", href: "/money" }])),
    ctx
  );
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.ok ? r.screen.actions : [], [
    { label: "Volver a hoy", intent: "hoy" },
    { label: "Dinero", href: "/money" }
  ]);
});

test("Acciones ilegales: fuera", () => {
  for (const a of [{ label: "x", intent: "borrarTodo" }, { label: "x", href: "/money", intent: "hoy" }, { label: "", href: "/money" }, { href: "/money" }]) {
    assert.strictEqual(validarScreen(con((s) => (s.actions = [a])), ctx).ok, false, JSON.stringify(a));
  }
});

test("sanearAccion recorta la etiqueta", () => {
  assert.deepStrictEqual(sanearAccion({ label: "  Dinero  ", href: "/money" }, []), { label: "Dinero", href: "/money" });
  assert.strictEqual(sanearAccion(null, []), null);
});
