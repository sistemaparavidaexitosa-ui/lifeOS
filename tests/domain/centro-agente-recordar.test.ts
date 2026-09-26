// tests/domain/centro-agente-recordar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarMemoria, planDeRecordar, MAX_MEMORIA_CENTRO } from "../../src/lib/domain/centro/agente/recordar.ts";

const HOY = "2026-09-26";
const fila = (i: number, origin = "centro", valid_until: string | null = "2026-12-01") => ({
  id: `m${i}`, text: `Memoria ${i}`, origin, created_at: `2026-09-${String(10 + (i % 15)).padStart(2, "0")}T00:00:00Z`, valid_until
});

test("normalizarMemoria: acentos, mayúsculas, espacios y punto final no cuentan", () => {
  assert.strictEqual(normalizarMemoria("  Prefiero  los GRAMOS.  "), normalizarMemoria("prefiero los gramos"));
  assert.strictEqual(normalizarMemoria("Cafeína"), "cafeina");
});

test("Guardar: fila con origin centro y caducidad a 90 días", () => {
  const r = planDeRecordar({ texto: "Prefiere gramos", ambito: "preference" }, [], HOY);
  assert.deepStrictEqual(r, { accion: "guardar", fila: { text: "Prefiere gramos", scope: "preference", origin: "centro", valid_until: "2026-12-25" }, borrar: [] });
});

test("Duplicado de una memoria de la persona (normalizado): se omite (Review Focus 3)", () => {
  const r = planDeRecordar({ texto: "prefiere  GRAMOS.", ambito: "preference" }, [{ id: "u1", text: "Prefiere gramos", origin: "user", created_at: "2026-01-01T00:00:00Z", valid_until: null }], HOY);
  assert.deepStrictEqual(r, { accion: "omitir", motivo: "ya la recuerdo" });
});

test("Una memoria caducada no cuenta como duplicado", () => {
  const r = planDeRecordar({ texto: "Prefiere gramos", ambito: "preference" }, [{ id: "c1", text: "Prefiere gramos", origin: "centro", created_at: "2026-01-01T00:00:00Z", valid_until: "2026-06-01" }], HOY);
  assert.strictEqual(r.accion, "guardar");
});

test("Tope: con 20 memorias del Centro vigentes se borra la más vieja del Centro, nunca las de la persona", () => {
  const existentes = [...Array.from({ length: MAX_MEMORIA_CENTRO }, (_, i) => fila(i)), fila(99, "user", null)];
  const r = planDeRecordar({ texto: "Nueva", ambito: "time" }, existentes, HOY);
  assert.ok(r.accion === "guardar");
  const masVieja = [...existentes].filter((m) => m.origin === "centro").sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!;
  assert.deepStrictEqual(r.accion === "guardar" && r.borrar, [masVieja.id]);
});
