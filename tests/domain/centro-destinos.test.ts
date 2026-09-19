// tests/domain/centro-destinos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { destinosDelCentro } from "../../src/lib/domain/centro/destinos.ts";
import { NAV_ITEMS } from "../../src/components/nav-items.ts";

// El centro lee la MISMA lista que la barra lateral. Si alguien añade una
// pantalla al menú, aparece aquí sin tocar nada; si hubiera dos listas, la
// segunda se quedaría atrás a la primera pantalla nueva.

const falsos = [
  { href: "/home", label: "Home", group: "Panel" },
  { href: "/reports", label: "Reportes", group: "Panel" },
  { href: "/execution", label: "Proyectos", group: "Execution OS" },
  { href: "/activity", label: "Actividad", group: "Execution OS", hidden: true },
  { href: "/settings", label: "Configuración", group: "Cuenta" }
];

test("Agrupa conservando el orden del menú", () => {
  assert.deepStrictEqual(destinosDelCentro(falsos), [
    { grupo: "Panel", destinos: [{ href: "/reports", label: "Reportes" }] },
    { grupo: "Execution OS", destinos: [{ href: "/execution", label: "Proyectos" }] }
  ]);
});

test("Home no se lista: el centro ES Home", () => {
  assert.ok(!destinosDelCentro(falsos).some((g) => g.destinos.some((d) => d.href === "/home")));
});

test("Configuración no se lista: baja al pie del centro", () => {
  assert.ok(!destinosDelCentro(falsos).some((g) => g.grupo === "Cuenta"));
});

test("Lo oculto del menú sigue oculto", () => {
  assert.ok(!destinosDelCentro(falsos).some((g) => g.destinos.some((d) => d.href === "/activity")));
});

test("Un grupo que se queda sin destinos no deja un titular vacío", () => {
  assert.deepStrictEqual(destinosDelCentro([{ href: "/home", label: "Home", group: "Panel" }]), []);
});

// ---------------------------------------------------------------------------
// Contra la lista REAL
// ---------------------------------------------------------------------------

test("Con el menú real salen los cinco grupos visibles, sin Panel vacío", () => {
  const grupos = destinosDelCentro(NAV_ITEMS).map((g) => g.grupo);
  assert.deepStrictEqual(grupos, ["Panel", "Execution OS", "Personal Development OS", "Money OS (privado)"]);
});

test("Todo destino visible del menú, salvo Home y Configuración, está en el centro", () => {
  const enCentro = new Set(destinosDelCentro(NAV_ITEMS).flatMap((g) => g.destinos.map((d) => d.href)));
  for (const item of NAV_ITEMS) {
    if (item.hidden || item.href === "/home" || item.href === "/settings") continue;
    assert.ok(enCentro.has(item.href), `falta ${item.href} en el centro`);
  }
});

test("Ningún destino del centro está oculto en el menú", () => {
  const ocultos = new Set(NAV_ITEMS.filter((i) => i.hidden).map((i) => i.href));
  for (const g of destinosDelCentro(NAV_ITEMS)) {
    for (const d of g.destinos) assert.ok(!ocultos.has(d.href), `${d.href} está oculto en el menú`);
  }
});
