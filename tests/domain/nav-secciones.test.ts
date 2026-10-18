import { test } from "node:test";
import assert from "node:assert/strict";
import { SECCIONES, seccionDe, pestanaActiva, NAV_ITEMS } from "../../src/components/nav-items.ts";

test("La barra inferior: Home, Execution, Centro, Money y Personal Development, en ese orden", () => {
  assert.deepEqual(SECCIONES.map((s) => s.id), ["home", "execution", "centro", "money", "development"]);
});

test("Cada ruta cae en su sección, y la pestaña activa es la más específica", () => {
  assert.equal(seccionDe("/home")?.id, "home");
  assert.equal(seccionDe("/execution")?.id, "execution");
  assert.equal(seccionDe("/time")?.id, "execution");
  assert.equal(seccionDe("/planning")?.id, "execution");
  assert.equal(seccionDe("/money/budget")?.id, "money");
  assert.equal(seccionDe("/investments/abc")?.id, "money");
  assert.equal(seccionDe("/development/routines/analytics")?.id, "development");
  assert.equal(seccionDe("/settings"), null);
  const m = seccionDe("/money/budget")!;
  assert.equal(pestanaActiva("/money/budget", m)?.href, "/money/budget");
  assert.equal(pestanaActiva("/money", m)?.href, "/money");
  assert.equal(pestanaActiva("/development/routines/analytics", seccionDe("/development/routines/analytics")!)?.href, "/development/routines");
});

test("Reportes, Eisenhower y el mapa de dependencias salen de la interfaz (las rutas siguen)", () => {
  const visibles = SECCIONES.flatMap((s) => s.pestanas.map((p) => p.href));
  for (const r of ["/reports", "/execution/eisenhower", "/graph", "/planning"]) assert.ok(!visibles.includes(r), r);
  for (const r of ["/reports", "/execution/eisenhower", "/graph"]) assert.ok(NAV_ITEMS.find((n) => n.href === r)?.hidden, r);
});
