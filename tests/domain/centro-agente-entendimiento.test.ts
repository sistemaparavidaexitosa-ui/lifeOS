// tests/domain/centro-agente-entendimiento.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { seccionDeConfirmacion } from "../../src/lib/domain/centro/agente/entendimiento.ts";
import { validarPorSeccion } from "../../src/lib/domain/centro/runtime/validador.ts";

const b = { entendi: "Quieres registrar la avena.", seguir: "Sí, hazlo", alternativas: [{ etiqueta: "Otra cosa", texto: null }] };

test("La confirmación se vuelve sección y pasa el validador", () => {
  const s = seccionDeConfirmacion(b, "b0");
  assert.deepStrictEqual(s, { id: "b0", kind: "confirmarEntendimiento", data: b });
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Marcado en el texto: el validador la tumba (no se pinta HTML del modelo)", () => {
  const s = seccionDeConfirmacion({ ...b, entendi: "<b>hola</b>" }, "b0");
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 0);
});
