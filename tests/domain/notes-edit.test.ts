// tests/domain/notes-edit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plainLength,
  sliceInlines,
  applyMark,
  hasMark,
  styleOf,
  setBlockStyle,
  toggleTodo,
  splitBlock,
  mergeBlocks
} from "../../src/lib/domain/notes/edit.ts";
import type { Block, Inline } from "../../src/lib/domain/notes/markup.ts";

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

test("applyMark: dos enlaces contiguos con el MISMO href se funden en uno solo", () => {
  // Antes del arreglo, marcar (aunque sea un no-op para un enlace) partía
  // el resultado en fragmentos "link" con el mismo href que ya no volvían
  // a juntarse, y el serializador escribía el href repetido dos veces.
  const enlaces: Inline[] = [
    { kind: "link", text: "ab", href: "https://x" },
    { kind: "link", text: "cd", href: "https://x" }
  ];
  assert.deepStrictEqual(applyMark(enlaces, 0, 4, "bold"), [
    { kind: "link", text: "abcd", href: "https://x" }
  ]);
});

test("applyMark: dos enlaces contiguos con href DISTINTO no se funden", () => {
  const enlaces: Inline[] = [
    { kind: "link", text: "ab", href: "https://x" },
    { kind: "link", text: "cd", href: "https://y" }
  ];
  assert.deepStrictEqual(applyMark(enlaces, 0, 4, "bold"), enlaces);
});

const parrafo = (t: string): Block => ({ kind: "paragraph", content: texto(t) });

test("styleOf: cada bloque conoce su estilo del menú «Aa»", () => {
  assert.strictEqual(styleOf(parrafo("x")), "body");
  assert.strictEqual(styleOf({ kind: "heading", level: 1, content: texto("x") }), "title");
  assert.strictEqual(styleOf({ kind: "heading", level: 2, content: texto("x") }), "heading");
  assert.strictEqual(styleOf({ kind: "heading", level: 3, content: texto("x") }), "subheading");
});

test("setBlockStyle: de párrafo a título y de vuelta", () => {
  const titulo = setBlockStyle(parrafo("Acuerdos"), "title");
  assert.deepStrictEqual(titulo, { kind: "heading", level: 1, content: texto("Acuerdos") });
  assert.deepStrictEqual(setBlockStyle(titulo, "body"), parrafo("Acuerdos"));
});

test("setBlockStyle: de párrafo a lista de casillas", () => {
  assert.deepStrictEqual(setBlockStyle(parrafo("pagar luz"), "todo"), {
    kind: "todo",
    items: [{ done: false, content: texto("pagar luz") }]
  });
});

test("setBlockStyle: una lista de varios ítems a párrafo conserva TODAS las líneas", () => {
  // Perder ítems al cambiar de estilo es destruir texto que el usuario
  // escribió. Se unen con salto de línea, que el párrafo sí respeta.
  const lista: Block = { kind: "bullets", items: [texto("uno"), texto("dos")] };
  assert.deepStrictEqual(setBlockStyle(lista, "body"), parrafo("uno\ndos"));
});

test("setBlockStyle: de tabla a texto conserva las celdas como líneas", () => {
  const tabla: Block = { kind: "table", head: [texto("a"), texto("b")], rows: [[texto("1"), texto("2")]] };
  assert.deepStrictEqual(setBlockStyle(tabla, "body"), parrafo("a\nb\n1\n2"));
});

test("setBlockStyle: a tabla se crea una 2×2 con la línea actual en la primera celda", () => {
  const tabla = setBlockStyle(parrafo("Área"), "table") as Extract<Block, { kind: "table" }>;
  assert.strictEqual(tabla.kind, "table");
  assert.strictEqual(tabla.head.length, 2);
  assert.strictEqual(tabla.rows.length, 1);
  assert.deepStrictEqual(tabla.head[0], texto("Área"));
});

test("toggleTodo: alterna sólo el ítem pedido", () => {
  const lista: Block = {
    kind: "todo",
    items: [
      { done: false, content: texto("a") },
      { done: false, content: texto("b") }
    ]
  };
  const despues = toggleTodo(lista, 1) as Extract<Block, { kind: "todo" }>;
  assert.deepStrictEqual(
    despues.items.map((i) => i.done),
    [false, true]
  );
});

test("splitBlock: Enter a mitad de un párrafo lo parte en dos", () => {
  const [a, b] = splitBlock(parrafo("holamundo"), 0, 4);
  assert.deepStrictEqual(a, parrafo("hola"));
  assert.deepStrictEqual(b, parrafo("mundo"));
});

test("splitBlock: Enter a mitad de una negrita conserva la marca en las dos mitades", () => {
  const bloque: Block = { kind: "paragraph", content: [{ kind: "bold", text: "abcdef" }] };
  const [a, b] = splitBlock(bloque, 0, 3);
  assert.deepStrictEqual(a, { kind: "paragraph", content: [{ kind: "bold", text: "abc" }] });
  assert.deepStrictEqual(b, { kind: "paragraph", content: [{ kind: "bold", text: "def" }] });
});

test("splitBlock: Enter dentro de una lista crea otro ítem, no otro bloque", () => {
  const lista: Block = { kind: "bullets", items: [texto("uno"), texto("dos")] };
  const [a, b] = splitBlock(lista, 0, 1);
  assert.deepStrictEqual(a, { kind: "bullets", items: [texto("u")] });
  assert.deepStrictEqual(b, { kind: "bullets", items: [texto("no"), texto("dos")] });
});

test("splitBlock: Enter tras un encabezado abre un párrafo, no otro encabezado", () => {
  // Lo que hace el iPhone: el título no se propaga a la línea siguiente.
  const [a, b] = splitBlock({ kind: "heading", level: 2, content: texto("Acuerdos") }, 0, 8);
  assert.strictEqual(a.kind, "heading");
  assert.deepStrictEqual(b, parrafo(""));
});

test("splitBlock: Enter dentro de un bloque monoespaciado parte su texto, no lo duplica", () => {
  const [a, b] = splitBlock({ kind: "mono", text: "unodos" }, 0, 3);
  assert.deepStrictEqual(a, { kind: "mono", text: "uno" });
  assert.deepStrictEqual(b, { kind: "mono", text: "dos" });
});

test("splitBlock: Enter en una tabla la deja intacta y abre un párrafo detrás", () => {
  const tabla: Block = { kind: "table", head: [texto("a")], rows: [] };
  const [a, b] = splitBlock(tabla, 0, 0);
  assert.deepStrictEqual(a, tabla);
  assert.deepStrictEqual(b, parrafo(""));
});

test("mergeBlocks: Backspace al inicio funde dos párrafos", () => {
  assert.deepStrictEqual(mergeBlocks(parrafo("hola"), parrafo("mundo")), [parrafo("holamundo")]);
});

test("mergeBlocks: fundir con una tabla o un bloque monoespaciado NO se hace", () => {
  // No significa nada, y hacerlo destruiría la rejilla o el sangrado.
  assert.strictEqual(mergeBlocks(parrafo("a"), { kind: "mono", text: "x" }), null);
  assert.strictEqual(
    mergeBlocks({ kind: "table", head: [texto("a")], rows: [] }, parrafo("b")),
    null
  );
});

test("mergeBlocks: un párrafo absorbe el primer ítem y el RESTO de la lista sobrevive", () => {
  const lista: Block = { kind: "bullets", items: [texto("uno"), texto("dos")] };
  assert.deepStrictEqual(mergeBlocks(parrafo("hola "), lista), [
    parrafo("hola uno"),
    { kind: "bullets", items: [texto("dos")] }
  ]);
});

test("mergeBlocks: si la lista se queda sin ítems, no deja un bloque vacío detrás", () => {
  const lista: Block = { kind: "bullets", items: [texto("uno")] };
  assert.deepStrictEqual(mergeBlocks(parrafo("hola "), lista), [parrafo("hola uno")]);
});

test("mergeBlocks: el ítem que sobra de una lista de casillas conserva su `done`", () => {
  // El caso donde perder el estado sería invisible hasta que alguien
  // perdiera su racha: el segundo pendiente ya estaba marcado como hecho.
  const lista: Block = {
    kind: "todo",
    items: [
      { done: false, content: texto("uno") },
      { done: true, content: texto("dos") }
    ]
  };
  assert.deepStrictEqual(mergeBlocks(parrafo("hola "), lista), [
    parrafo("hola uno"),
    { kind: "todo", items: [{ done: true, content: texto("dos") }] }
  ]);
});
