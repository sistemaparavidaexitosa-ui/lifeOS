// tests/domain/notes-claves.test.ts
//
// Las claves de React del editor (D-157). Lo que se prueba es UNA propiedad:
// tras Enter o Backspace, la línea donde queda el cursor conserva la clave de
// la línea donde se pulsó. Con la misma clave React conserva el MISMO nodo, así
// que el foco no tiene que saltar a otro contenteditable, que es lo que el
// iPhone no hace: tras Enter seguía escribiendo en la línea de arriba.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alinearClaves,
  clavesTrasEnter,
  clavesTrasSalirDeLista,
  clavesTrasFundirLinea,
  clavesTrasFundirBloques,
  type Claves
} from "../../src/lib/domain/notes/claves.ts";
import type { Block, Inline } from "../../src/lib/domain/notes/markup.ts";

const texto = (t: string): Inline[] => [{ kind: "text", text: t }];
const parrafo = (t: string): Block => ({ kind: "paragraph", content: texto(t) });
const viñetas = (...ts: string[]): Block => ({ kind: "bullets", items: ts.map(texto) });

/** Generador determinista: n1, n2, n3… */
function generador() {
  let n = 0;
  return () => `n${++n}`;
}

test("alinearClaves: da una clave a cada bloque y a cada línea, y conserva las que ya había", () => {
  const nueva = generador();
  const c = alinearClaves({ bloques: ["a"], items: [["a0"]] }, [parrafo("x"), viñetas("1", "2")], nueva);
  assert.deepStrictEqual(c, { bloques: ["a", "n1"], items: [["a0"], ["n2", "n3"]] });
});

test("alinearClaves: si sobran claves (deshacer quitó bloques), recorta por el final", () => {
  const c = alinearClaves({ bloques: ["a", "b", "c"], items: [["a0"], ["b0"], ["c0"]] }, [parrafo("x")], generador());
  assert.deepStrictEqual(c, { bloques: ["a"], items: [["a0"]] });
});

test("clavesTrasEnter: al partir un párrafo, la línea de ABAJO conserva la clave", () => {
  const antes: Claves = { bloques: ["a", "b", "c"], items: [["a0"], ["b0"], ["c0"]] };
  const c = clavesTrasEnter(antes, 1, 0, parrafo("holamundo"), [parrafo("hola"), parrafo("mundo")], generador());
  assert.deepStrictEqual(c, { bloques: ["a", "n1", "b", "c"], items: [["a0"], ["n2"], ["b0"], ["c0"]] });
});

test("clavesTrasEnter: dentro de una lista, el ítem de ABAJO conserva la clave", () => {
  const antes: Claves = { bloques: ["a", "b"], items: [["a0"], ["x", "y"]] };
  const c = clavesTrasEnter(antes, 1, 0, viñetas("uno", "dos"), [viñetas("u", "no", "dos")], generador());
  assert.deepStrictEqual(c, { bloques: ["a", "b"], items: [["a0"], ["n1", "x", "y"]] });
});

test("clavesTrasEnter: tras un encabezado nace un párrafo, así que el encabezado se queda su clave", () => {
  // Otra etiqueta (h3 → p) obliga a React a crear otro nodo de todos modos.
  const antes: Claves = { bloques: ["a", "b"], items: [["a0"], ["b0"]] };
  const encabezado: Block = { kind: "heading", level: 2, content: texto("Acuerdos") };
  const c = clavesTrasEnter(antes, 0, 0, { ...encabezado }, [encabezado, parrafo("")], generador());
  assert.deepStrictEqual(c, { bloques: ["a", "n1", "b"], items: [["a0"], ["n2"], ["b0"]] });
});

test("clavesTrasSalirDeLista: el ítem vacío se va y el párrafo nuevo entra detrás de la lista", () => {
  const antes: Claves = { bloques: ["a", "b"], items: [["x", "y", "z"], ["b0"]] };
  const c = clavesTrasSalirDeLista(antes, 0, 2, true, generador());
  assert.deepStrictEqual(c, { bloques: ["a", "n1", "b"], items: [["x", "y"], ["n2"], ["b0"]] });
});

test("clavesTrasFundirLinea: Backspace en un ítem lo funde con el anterior y conserva la clave del de ABAJO", () => {
  const antes: Claves = { bloques: ["a"], items: [["x", "y", "z"]] };
  assert.deepStrictEqual(clavesTrasFundirLinea(antes, 0, 1), { bloques: ["a"], items: [["y", "z"]] });
});

test("clavesTrasFundirBloques: dos párrafos fundidos conservan la clave del de ABAJO", () => {
  const antes: Claves = { bloques: ["a", "b", "c"], items: [["a0"], ["b0"], ["c0"]] };
  const c = clavesTrasFundirBloques(antes, 2, parrafo("mundo"), [parrafo("holamundo")]);
  assert.deepStrictEqual(c, { bloques: ["a", "c"], items: [["a0"], ["c0"]] });
});

test("clavesTrasFundirBloques: si lo fundido cambia de tipo, se queda la clave del de arriba", () => {
  const antes: Claves = { bloques: ["a", "b"], items: [["a0"], ["b0"]] };
  const encabezado: Block = { kind: "heading", level: 2, content: texto("holamundo") };
  const c = clavesTrasFundirBloques(antes, 1, parrafo("mundo"), [encabezado]);
  assert.deepStrictEqual(c, { bloques: ["a"], items: [["a0"]] });
});

test("clavesTrasFundirBloques: una lista fundida con un párrafo deja su resto con su propia clave", () => {
  const antes: Claves = { bloques: ["a", "b"], items: [["a0"], ["x", "y"]] };
  const c = clavesTrasFundirBloques(antes, 1, viñetas("uno", "dos"), [parrafo("holauno"), viñetas("dos")]);
  assert.deepStrictEqual(c, { bloques: ["a", "b"], items: [["a0"], ["y"]] });
});
