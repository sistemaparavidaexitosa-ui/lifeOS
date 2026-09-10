// tests/domain/graph-selection.test.ts
// Los gestos de selección. Son un contrato que la gente ya conoce de otras
// herramientas: mayúsculas añade, Alt quita, Ctrl/Cmd alterna. Romperlo se nota
// como «esta app va rara» sin que nadie sepa decir por qué.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applySelection, esArrastre, marquee, modeFromEvent } from "../../src/lib/domain/graph/selection.ts";

const teclas = (o: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) =>
  ({ shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...o });

test("cada combinación de teclas da su gesto", () => {
  assert.strictEqual(modeFromEvent(teclas()), "replace");
  assert.strictEqual(modeFromEvent(teclas({ shiftKey: true })), "add");
  assert.strictEqual(modeFromEvent(teclas({ altKey: true })), "subtract");
  assert.strictEqual(modeFromEvent(teclas({ ctrlKey: true })), "toggle");
});

test("Cmd en un Mac hace lo mismo que Ctrl en Windows", () => {
  assert.strictEqual(modeFromEvent(teclas({ metaKey: true })), "toggle");
});

test("Alt gana a las demás: quitar es lo más explícito", () => {
  assert.strictEqual(modeFromEvent(teclas({ altKey: true, shiftKey: true, ctrlKey: true })), "subtract");
});

test("replace descarta lo que hubiera", () => {
  assert.deepStrictEqual([...applySelection(new Set(["a", "b"]), ["c"], "replace")], ["c"]);
});

test("add suma, subtract resta, toggle alterna", () => {
  const actual = new Set(["a", "b"]);
  assert.deepStrictEqual([...applySelection(actual, ["c"], "add")].sort(), ["a", "b", "c"]);
  assert.deepStrictEqual([...applySelection(actual, ["a"], "subtract")], ["b"]);
  assert.deepStrictEqual([...applySelection(actual, ["a", "c"], "toggle")].sort(), ["b", "c"]);
});

test("aplicar una selección no modifica la anterior", () => {
  // El componente guarda la selección en estado de React: mutarla en sitio
  // haría que la pantalla no se repintara al deseleccionar.
  const actual = new Set(["a"]);
  applySelection(actual, ["b"], "add");
  assert.deepStrictEqual([...actual], ["a"]);
});

test("el rectángulo se normaliza aunque arrastres hacia atrás", () => {
  // Arrastrar de derecha a izquierda daba anchura negativa y no seleccionaba
  // nada. Es el fallo que tiene toda selección por rectángulo escrita a la
  // primera.
  assert.deepStrictEqual(
    marquee({ x: 100, y: 100 }, { x: 20, y: 30 }),
    { x: 20, y: 30, width: 80, height: 70 }
  );
});

test("un temblor de tres píxeles sigue siendo un clic", () => {
  assert.strictEqual(esArrastre({ x: 0, y: 0 }, { x: 3, y: 3 }), false);
  assert.strictEqual(esArrastre({ x: 0, y: 0 }, { x: 0, y: 5 }), true);
});
