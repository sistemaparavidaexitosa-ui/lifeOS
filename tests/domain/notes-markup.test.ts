// tests/domain/notes-markup.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseInline,
  parseNote,
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
