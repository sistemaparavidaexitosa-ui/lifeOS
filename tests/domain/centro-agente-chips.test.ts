// tests/domain/centro-agente-chips.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPACIDADES_VISIBLES, elegirChips } from "../../src/lib/domain/centro/agente/chips.ts";

test("Cada chip tiene id único y texto corto", () => {
  const ids = CAPACIDADES_VISIBLES.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const c of CAPACIDADES_VISIBLES) assert.ok(c.texto.length <= 60, c.id);
});

test("Nunca un chip de un dominio apagado (Review Focus 5)", () => {
  const chips = elegirChips({ dominios: ["execution"], franja: "manana", usos: {} });
  const porId = new Map(CAPACIDADES_VISIBLES.map((c) => [c.id, c]));
  for (const c of chips) {
    const d = porId.get(c.id)!.dominio;
    assert.ok(d === null || d === "execution", c.id);
  }
});

test("La franja filtra: de mañana no sale «Registra lo que cené»", () => {
  const ids = elegirChips({ dominios: ["nutrition", "execution", "money", "growth"], franja: "manana", usos: {} }).map((c) => c.id);
  assert.ok(!ids.includes("cena"));
});

test("Lo más usado va primero; como mucho seis", () => {
  const chips = elegirChips({ dominios: ["nutrition", "execution", "money", "growth"], franja: "tarde", usos: { inversiones: 5, macros: 2 } });
  assert.deepStrictEqual(chips.slice(0, 2).map((c) => c.id), ["inversiones", "macros"]);
  assert.ok(chips.length <= 6);
});

test("Sin dominios activos quedan solo los generales", () => {
  const chips = elegirChips({ dominios: [], franja: "manana", usos: {} });
  assert.ok(chips.length >= 1);
  const porId = new Map(CAPACIDADES_VISIBLES.map((c) => [c.id, c]));
  for (const c of chips) assert.strictEqual(porId.get(c.id)!.dominio, null);
});
