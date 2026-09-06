// tests/domain/notes-markup.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseInline,
  parseNote,
  serializeNote,
  serializeInline,
  noteExcerpt,
  noteDisplayTitle,
  NOTA_SIN_TITULO,
  type Block
} from "../../src/lib/domain/notes/markup.ts";

test("parseInline: texto plano queda como un solo fragmento", () => {
  assert.deepStrictEqual(parseInline("acuerdos de la reunión"), [
    { kind: "text", text: "acuerdos de la reunión" }
  ]);
});

test("parseInline: negrita, cursiva y código", () => {
  assert.deepStrictEqual(parseInline("hay **prisa**, es *urgente* y usa `npm run build`"), [
    { kind: "text", text: "hay " },
    { kind: "bold", text: "prisa" },
    { kind: "text", text: ", es " },
    { kind: "italic", text: "urgente" },
    { kind: "text", text: " y usa " },
    { kind: "code", text: "npm run build" }
  ]);
});

test("parseInline: el código gana a la negrita, para no romper un fragmento literal", () => {
  // Sin la precedencia, `**kwargs` dentro de comillas se comería los asteriscos
  // y el lector vería "kwargs" en negrita en vez del literal que se escribió.
  assert.deepStrictEqual(parseInline("pasa `**kwargs` al final"), [
    { kind: "text", text: "pasa " },
    { kind: "code", text: "**kwargs" },
    { kind: "text", text: " al final" }
  ]);
});

test("parseInline: enlace con texto y enlace suelto", () => {
  assert.deepStrictEqual(parseInline("ver [el acta](https://ejemplo.com/acta) o https://ejemplo.com"), [
    { kind: "text", text: "ver " },
    { kind: "link", text: "el acta", href: "https://ejemplo.com/acta" },
    { kind: "text", text: " o " },
    { kind: "link", text: "https://ejemplo.com", href: "https://ejemplo.com" }
  ]);
});

test("parseInline: un esquema que no es http(s) NO produce un enlace", () => {
  // La defensa contra `javascript:` vive en el propio patrón: si esto llegara
  // a devolver un `link`, quien pinta construiría un href ejecutable.
  const parts = parseInline("[pulsa aquí](javascript:alert(1))");
  assert.ok(parts.every((p) => p.kind !== "link"));
  assert.deepStrictEqual(parts, [{ kind: "text", text: "[pulsa aquí](javascript:alert(1))" }]);
});

test("parseInline: subrayado y tachado", () => {
  assert.deepStrictEqual(parseInline("esto va ++subrayado++ y esto ~~fuera~~"), [
    { kind: "text", text: "esto va " },
    { kind: "underline", text: "subrayado" },
    { kind: "text", text: " y esto " },
    { kind: "strike", text: "fuera" }
  ]);
});

test("parseInline: dos guiones bajos NO son subrayado", () => {
  // En CommonMark `__x__` es negrita. Si aquí fuese subrayado, quien pegue
  // Markdown de fuera vería subrayado donde escribió negrita.
  assert.deepStrictEqual(parseInline("__esto__"), [{ kind: "text", text: "__esto__" }]);
});

test("serializeInline: subrayado y tachado vuelven a su sintaxis", () => {
  assert.strictEqual(
    serializeInline([
      { kind: "underline", text: "a" },
      { kind: "strike", text: "b" }
    ]),
    "++a++~~b~~"
  );
});

test("parseInline: una línea vacía sigue devolviendo un fragmento", () => {
  // Devolver [] haría desaparecer el párrafo entero al pintarlo.
  assert.deepStrictEqual(parseInline(""), [{ kind: "text", text: "" }]);
});

test("parseNote: títulos de tres niveles", () => {
  const blocks = parseNote("# Acta\n## Acuerdos\n### Detalle");
  assert.deepStrictEqual(
    blocks.map((b) => (b.kind === "heading" ? b.level : b.kind)),
    [1, 2, 3]
  );
});

test("parseNote: viñetas consecutivas forman UNA lista", () => {
  const blocks = parseNote("- uno\n- dos\n- tres");
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0]?.kind, "bullets");
  assert.strictEqual((blocks[0] as Extract<Block, { kind: "bullets" }>).items.length, 3);
});

test("parseNote: la lista numerada acepta '1.' y '1)'", () => {
  const blocks = parseNote("1. uno\n2) dos");
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0]?.kind, "ordered");
});

test("parseNote: una línea en blanco corta el párrafo", () => {
  const blocks = parseNote("primero\n\nsegundo");
  assert.strictEqual(blocks.length, 2);
  assert.ok(blocks.every((b) => b.kind === "paragraph"));
});

test("parseNote: las líneas seguidas de un párrafo conservan sus saltos", () => {
  // Fundirlas en un renglón corrido rompe la lista de nombres que alguien
  // escribió a saltos de línea sin usar viñetas.
  const blocks = parseNote("Ana\nLuis\nMarta");
  assert.strictEqual(blocks.length, 1);
  const [block] = blocks;
  assert.strictEqual(block?.kind, "paragraph");
  assert.strictEqual((block as Extract<Block, { kind: "paragraph" }>).content[0]?.text, "Ana\nLuis\nMarta");
});

test("parseNote: pasar de viñetas a párrafo cierra la lista", () => {
  const blocks = parseNote("- uno\ntexto suelto");
  assert.deepStrictEqual(
    blocks.map((b) => b.kind),
    ["bullets", "paragraph"]
  );
});

test("parseNote: la cita agrupa sus líneas", () => {
  const blocks = parseNote("> primera\n> segunda");
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0]?.kind, "quote");
});

test("parseNote: el HTML pegado se queda en TEXTO, nunca en marcado", () => {
  // La garantía que sostiene todo el módulo: el cuerpo lo escribe un
  // colaborador, y nada de lo que escriba puede salir como etiqueta.
  const blocks = parseNote('<img src=x onerror="alert(1)">');
  assert.strictEqual(blocks.length, 1);
  const [block] = blocks;
  assert.strictEqual(block?.kind, "paragraph");
  assert.deepStrictEqual((block as Extract<Block, { kind: "paragraph" }>).content, [
    { kind: "text", text: '<img src=x onerror="alert(1)">' }
  ]);
});

test("parseNote: un cuerpo vacío no produce bloques", () => {
  assert.deepStrictEqual(parseNote(""), []);
  assert.deepStrictEqual(parseNote("\n\n  \n"), []);
});

test("noteExcerpt: quita el marcado y recorta", () => {
  assert.strictEqual(noteExcerpt("## Acuerdos\n- comprar **café**"), "Acuerdos · comprar café");
});

test("noteExcerpt: respeta el máximo con puntos suspensivos", () => {
  const excerpt = noteExcerpt("a".repeat(300), 20);
  assert.strictEqual(excerpt.length, 20);
  assert.ok(excerpt.endsWith("…"));
});

test("noteDisplayTitle: usa el título propio cuando lo hay", () => {
  assert.strictEqual(noteDisplayTitle("  Acta de marzo  ", "lo que sea"), "Acta de marzo");
});

test("noteDisplayTitle: sin título, cae a la primera línea sin su marcado", () => {
  // Obligar a titular antes de escribir es justo la fricción que hace que
  // nadie apunte nada desde el móvil.
  assert.strictEqual(noteDisplayTitle("", "## Acuerdos de hoy\nmás cosas"), "Acuerdos de hoy");
  assert.strictEqual(noteDisplayTitle("", "- comprar café"), "comprar café");
});

test("noteDisplayTitle: sin título y sin cuerpo, un nombre de reserva", () => {
  assert.strictEqual(noteDisplayTitle("", "   \n  "), NOTA_SIN_TITULO);
});

test("parseInline: la barra invertida escapa el marcado", () => {
  // Sin esto, escribir «2 * 3 * 4» en el editor convierte « 3 » en cursiva
  // sola mientras tecleas. Es el fallo más desconcertante que puede tener.
  assert.deepStrictEqual(parseInline("2 \\* 3 \\* 4"), [{ kind: "text", text: "2 * 3 * 4" }]);
});

test("parseInline: los fragmentos de texto contiguos salen fusionados", () => {
  // La aritmética de offsets de edit.ts asume un solo fragmento por tramo de
  // texto; dos seguidos harían que applyMark marque el trozo equivocado.
  assert.deepStrictEqual(parseInline("a \\* b \\* c"), [{ kind: "text", text: "a * b * c" }]);
});

test("serializeInline: escapa lo que volvería a parsearse como marcado", () => {
  assert.strictEqual(serializeInline([{ kind: "text", text: "2 * 3" }]), "2 \\* 3");
  assert.strictEqual(serializeInline([{ kind: "bold", text: "ya" }]), "**ya**");
});

test("serializeInline: la barra vertical sólo se escapa dentro de una celda", () => {
  // En un párrafo un `|` es inofensivo y llenar el texto de barras invertidas
  // sería ensuciar lo que la gente lee en crudo.
  const contenido = [{ kind: "text" as const, text: "a | b" }];
  assert.strictEqual(serializeInline(contenido), "a | b");
  assert.strictEqual(serializeInline(contenido, { pipe: true }), "a \\| b");
});

test("serializeNote: un párrafo que empieza como otro bloque se escapa", () => {
  // «# no es un título» escrito como texto debe volver como texto, no como
  // encabezado. El escapado de inicio de línea es lo único que lo impide.
  const bloques = parseNote("\\# no es un título");
  assert.strictEqual(serializeNote(bloques), "\\# no es un título");
  assert.deepStrictEqual(parseNote(serializeNote(bloques)), bloques);
});

test("serializeNote: ida y vuelta sobre el dialecto de hoy", () => {
  const cuerpo = "# Acta\n\n- uno\n- **dos**\n\n1. primero\n\n> una cita\n\nver [aquí](https://ejemplo.com)";
  assert.deepStrictEqual(parseNote(serializeNote(parseNote(cuerpo))), parseNote(cuerpo));
});

// El corpus vive aquí y CRECE con cada bloque nuevo (tareas 2 a 5). Es la red
// que detecta que un bloque nuevo rompió el ida y vuelta de otro.
export const CORPUS_ROUND_TRIP = [
  "",
  "texto llano",
  "2 \\* 3 \\* 4",
  "una \\\\ barra invertida",
  "# título\n## subtítulo\n### sub-sub",
  "- uno\n- dos\n\n1. a\n2. b",
  "> cita\n> de dos líneas",
  "**negrita** *cursiva* `código` [x](https://a.b) https://suelto.com",
  "\\# no es un título",
  "\\- no es una viñeta",
  "párrafo con | barra vertical",
  "línea uno\nlínea dos del mismo párrafo",
  "#YOLO sin espacio",
  "##dos sin espacio",
  "++subrayado++ y ~~tachado~~ juntos",
  "un más + suelto y una tilde ~ suelta",
  "- [ ] sin hacer\n- [x] hecha",
  "- [x] hecha\n- [ ]",
  "- viñeta normal\n\n- [ ] casilla"
];

test("parseNote: las casillas son su propio bloque", () => {
  const bloques = parseNote("- [ ] pendiente\n- [x] hecho");
  assert.strictEqual(bloques.length, 1);
  const bloque = bloques[0] as Extract<Block, { kind: "todo" }>;
  assert.strictEqual(bloque.kind, "todo");
  assert.deepStrictEqual(
    bloque.items.map((i) => i.done),
    [false, true]
  );
  assert.deepStrictEqual(bloque.items[1]?.content, [{ kind: "text", text: "hecho" }]);
});

test("parseNote: una casilla no se mezcla con las viñetas de al lado", () => {
  // «- [ ] x» empieza igual que una viñeta; si el orden de las expresiones
  // está mal, la casilla acaba siendo un ítem de lista con corchetes.
  const bloques = parseNote("- viñeta\n- [ ] casilla");
  assert.deepStrictEqual(
    bloques.map((b) => b.kind),
    ["bullets", "todo"]
  );
});

test("parseNote: una casilla VACÍA sigue siendo una casilla", () => {
  // El editor crea una en cada Enter; si volviera como viñeta «[ ]», pulsar
  // Enter en una lista de pendientes la destruiría.
  const bloques = parseNote("- [x] hecho\n- [ ]");
  const bloque = bloques[0] as Extract<Block, { kind: "todo" }>;
  assert.strictEqual(bloque.kind, "todo");
  assert.strictEqual(bloque.items.length, 2);
  assert.deepStrictEqual(bloque.items[1]?.content, [{ kind: "text", text: "" }]);
});

test("parseNote: la X mayúscula también marca", () => {
  const bloques = parseNote("- [X] hecho");
  assert.strictEqual((bloques[0] as Extract<Block, { kind: "todo" }>).items[0]?.done, true);
});

test("noteExcerpt: el resumen incluye el texto de las casillas", () => {
  assert.strictEqual(noteExcerpt("- [x] comprar café\n- [ ] pagar luz"), "comprar café · pagar luz");
});

test("noteDisplayTitle: una nota sin título que empieza por casilla no muestra los corchetes", () => {
  // La lista de cuadernos enseña este texto. «[ ] pagar luz» como nombre de
  // una nota es basura visible en la primera pantalla del módulo.
  assert.strictEqual(noteDisplayTitle("", "- [ ] pagar luz\nmás cosas"), "pagar luz");
});

test("noteDisplayTitle: también sirve para una cita", () => {
  assert.strictEqual(noteDisplayTitle("", "> una cita"), "una cita");
});

test("serializeNote: un hashtag al inicio de línea no es un título y no se escapa", () => {
  // HEADING exige espacio tras la almohadilla; sin él, «#YOLO» ya es un
  // párrafo normal y escaparlo de más lo dejaría con una barra invertida
  // literal la próxima vez que se abriera la nota.
  const bloques = parseNote("#YOLO sin espacio");
  assert.strictEqual(serializeNote(bloques), "#YOLO sin espacio");
  assert.deepStrictEqual(parseNote(serializeNote(bloques)), bloques);
});

test("round-trip: el árbol es un punto fijo para todo el corpus", () => {
  for (const cuerpo of CORPUS_ROUND_TRIP) {
    const arbol = parseNote(cuerpo);
    assert.deepStrictEqual(
      parseNote(serializeNote(arbol)),
      arbol,
      `ida y vuelta rota para: ${JSON.stringify(cuerpo)}`
    );
  }
});
