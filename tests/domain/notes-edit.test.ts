// tests/domain/notes-edit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plainLength,
  sliceInlines,
  applyMark,
  hasMark
} from "../../src/lib/domain/notes/edit.ts";
import type { Inline } from "../../src/lib/domain/notes/markup.ts";

const texto = (t: string): Inline[] => [{ kind: "text", text: t }];

test("plainLength: cuenta el texto visible, no la sintaxis", () => {
  // El cursor del editor vive en coordenadas de texto visible. Si esto
  // contara los asteriscos, la selección caería siempre desplazada.
  assert.strictEqual(plainLength(texto("hola")), 4);
  assert.strictEqual(
    plainLength([
      { kind: "text", text: "a " },
      { kind: "bold", text: "bc" }
    ]),
    4
  );
});

test("sliceInlines: corta dentro de un fragmento", () => {
  assert.deepStrictEqual(sliceInlines(texto("abcdef"), 2, 4), [{ kind: "text", text: "cd" }]);
});

test("sliceInlines: corta a través de dos marcas conservando cada una", () => {
  const contenido: Inline[] = [
    { kind: "text", text: "abc" },
    { kind: "bold", text: "def" }
  ];
  assert.deepStrictEqual(sliceInlines(contenido, 2, 5), [
    { kind: "text", text: "c" },
    { kind: "bold", text: "de" }
  ]);
});

test("sliceInlines: un rango vacío devuelve nada", () => {
  assert.deepStrictEqual(sliceInlines(texto("abc"), 1, 1), []);
});

test("applyMark: marca un tramo de texto llano", () => {
  assert.deepStrictEqual(applyMark(texto("hola mundo"), 5, 10, "bold"), [
    { kind: "text", text: "hola " },
    { kind: "bold", text: "mundo" }
  ]);
});

test("applyMark: marcar sobre lo ya marcado lo DESMARCA", () => {
  // Es lo que hace el botón B del iPhone: alterna, no acumula.
  const negrita: Inline[] = [{ kind: "bold", text: "hola" }];
  assert.deepStrictEqual(applyMark(negrita, 0, 4, "bold"), [{ kind: "text", text: "hola" }]);
});

test("applyMark: marcar la mitad de una negrita la parte en tres", () => {
  // El caso que rompe las implementaciones ingenuas.
  const negrita: Inline[] = [{ kind: "bold", text: "abcdef" }];
  assert.deepStrictEqual(applyMark(negrita, 2, 4, "bold"), [
    { kind: "bold", text: "ab" },
    { kind: "text", text: "cd" },
    { kind: "bold", text: "ef" }
  ]);
});

test("applyMark: una marca nueva sustituye a la anterior, no se anidan", () => {
  // El modelo es plano a propósito: `Inline` no tiene hijos, así que negrita
  // + cursiva a la vez no se puede representar. Gana la última aplicada.
  const negrita: Inline[] = [{ kind: "bold", text: "hola" }];
  assert.deepStrictEqual(applyMark(negrita, 0, 4, "italic"), [{ kind: "italic", text: "hola" }]);
});

test("applyMark: un enlace conserva su destino al marcarse", () => {
  const enlace: Inline[] = [{ kind: "link", text: "aquí", href: "https://a.b" }];
  assert.deepStrictEqual(applyMark(enlace, 0, 4, "bold"), [
    { kind: "link", text: "aquí", href: "https://a.b" }
  ]);
});

test("hasMark: dice si TODO el rango lleva ya la marca", () => {
  const mixto: Inline[] = [
    { kind: "bold", text: "ab" },
    { kind: "text", text: "cd" }
  ];
  assert.strictEqual(hasMark(mixto, 0, 2, "bold"), true);
  assert.strictEqual(hasMark(mixto, 0, 4, "bold"), false);
  assert.strictEqual(hasMark(mixto, 2, 4, "bold"), false);
});
