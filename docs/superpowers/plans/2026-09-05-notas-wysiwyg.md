# Editor de notas con formato en vivo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el textarea de `/notebooks` por un editor con formato en vivo estilo notas del iPhone, sin cambiar cómo se guarda el cuerpo.

**Architecture:** `src/lib/domain/notes/markup.ts` deja de ser solo un parser de lectura y pasa a ser el modelo del editor: gana `serializeNote` como inversa de `parseNote`, y un módulo hermano `edit.ts` con las operaciones puras sobre el árbol. El editor de React mantiene `Block[]` en estado y sólo lleva la cuenta del cursor. El cuerpo se sigue guardando como texto Markdown, así que **ninguna migración de base de datos entra en este plan**.

**Tech Stack:** TypeScript, React 19, Next 15 (App Router), `node:test` con `--experimental-strip-types`. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-05-notas-wysiwyg-design.md`

## Global Constraints

- **Cero dependencias de runtime nuevas** (D-008). Las de hoy son `next`, `react`, `react-dom`, `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `clsx`. Si una tarea parece pedir una librería, es que la tarea está mal planteada.
- **Cero migraciones de base de datos.** `notes.body` sigue siendo texto Markdown. `notes.search`, `search_notes()` y `search_workspace()` no se tocan.
- **Nunca `dangerouslySetInnerHTML`, nunca `execCommand`, nunca guardar HTML** (D-038). Los `href` se restringen a `https?://` en el modelo, no en el DOM.
- **Todo el código y los comentarios en español**, igual que el resto del repo. Los nombres de las pruebas describen la conducta, no la función.
- **Pruebas:** `pnpm test:unit` corre `node --experimental-strip-types --test tests/domain/*.test.ts`. Un solo archivo: `node --experimental-strip-types --test tests/domain/notes-markup.test.ts`.
- **Verificación completa:** `pnpm verify`. Ojo: termina en `supabase db reset`, que borra la base local.
- **Alcance:** sólo `/notebooks`. `LogbookCard.tsx`, `KnowledgeCard.tsx` y los paneles de comentarios no se tocan.
- **Commits:** uno por tarea, en español, describiendo el problema que resuelve.

## Mapa de archivos

| Archivo | Responsabilidad | Tareas |
|---|---|---|
| `src/lib/domain/notes/markup.ts` | Dialecto: `parseNote` ⇄ `serializeNote`, escapado, tipos `Block`/`Inline` | 1–5 |
| `src/lib/domain/notes/edit.ts` | **Nuevo.** Operaciones puras sobre el árbol (marcas, split, merge, estilos) | 6–7 |
| `tests/domain/notes-markup.test.ts` | Dialecto y propiedad round-trip | 1–5 |
| `tests/domain/notes-edit.test.ts` | **Nuevo.** Operaciones de `edit.ts` | 6–7 |
| `src/app/(app)/notebooks/EditableLine.tsx` | **Nuevo.** El único `contenteditable` del proyecto | 8 |
| `src/app/(app)/notebooks/NoteDoc.tsx` | **Nuevo.** Recorre `Block[]`; foco, Enter/Backspace, autoformato | 9, 11 |
| `src/app/(app)/notebooks/FormatBar.tsx` | **Nuevo.** Menú «Aa», marcas, listas, tabla, enlace, deshacer | 10, 12 |
| `src/app/(app)/notebooks/NoteEditor.tsx` | Pantalla: guardado, conflicto, roles, pila de deshacer | 12–13 |
| `src/app/(app)/notebooks/NoteBody.tsx` | Sólo lectura (rol Viewer) | 2–5 |
| `src/app/(app)/notebooks/actions.ts` | Tope de 256 KB en `saveNote` | 13 |
| `src/app/globals.css` | Estilos de los bloques nuevos y de la barra | 5, 10 |
| `docs/DECISIONS.md`, `docs/CHECKS.md` | Decisiones nuevas y verificación manual en iPhone | 14 |

---

### Task 1: La inversa y el escapado

Es la tarea fundacional: sin ella el editor deforma el texto mientras se escribe. **No toca React.** Al terminar, el dialecto de hoy va y vuelve sin perder nada.

**Files:**
- Modify: `src/lib/domain/notes/markup.ts`
- Test: `tests/domain/notes-markup.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces:
  - `serializeNote(blocks: Block[]): string`
  - `serializeInline(content: Inline[], opts?: { pipe?: boolean }): string`
  - `escapeInlineText(text: string, opts?: { pipe?: boolean }): string`
  - `parseInline` y `parseNote` conservan su firma, pero ahora **fusionan fragmentos de texto adyacentes** y entienden `\` como escape.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade al final de `tests/domain/notes-markup.test.ts` (y añade `serializeNote` al `import` de arriba):

```ts
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
  "#YOLO sin espacio",
  "##dos sin espacio",
  "párrafo con | barra vertical",
  "línea uno\nlínea dos del mismo párrafo"
];

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
```

- [ ] **Step 2: Correr las pruebas y ver que fallan**

Run: `node --experimental-strip-types --test tests/domain/notes-markup.test.ts`
Expected: FAIL — `serializeNote is not exported` / `SyntaxError` en el import.

- [ ] **Step 3: Añadir el escape al patrón inline**

En `src/lib/domain/notes/markup.ts`, sustituye `INLINE_PATTERN` y el final de `parseInline`:

```ts
// El escape va PRIMERO: `\*` tiene que ganarle a `*`, o nunca se podría
// escribir un asterisco literal. El resto del orden es el de siempre —
// código antes que negrita, negrita antes que cursiva, enlace explícito
// antes que enlace suelto.
const ESCAPABLES = "\\`*~+[|";

const INLINE_PATTERN =
  /\\([\\`*~+[|])|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;

  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_PATTERN.exec(line)) !== null) {
    if (match.index > last) {
      out.push({ kind: "text", text: line.slice(last, match.index) });
    }
    const [, escapado, code, bold, italic, linkText, linkHref, bareUrl] = match;

    // Un carácter escapado es texto y nada más: se emite tal cual y la
    // fusión posterior lo pega al tramo que lo rodea.
    if (escapado !== undefined) out.push({ kind: "text", text: escapado });
    else if (code !== undefined) out.push({ kind: "code", text: code });
    else if (bold !== undefined) out.push({ kind: "bold", text: bold });
    else if (italic !== undefined) out.push({ kind: "italic", text: italic });
    else if (linkText !== undefined && linkHref !== undefined) {
      out.push({ kind: "link", text: linkText, href: linkHref });
    } else if (bareUrl !== undefined) {
      out.push({ kind: "link", text: bareUrl, href: bareUrl });
    }

    last = match.index + match[0].length;
  }

  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  if (!out.length) out.push({ kind: "text", text: "" });
  return fusionarTexto(out);
}

/**
 * Pega los fragmentos de texto contiguos en uno solo. Sin esto, «a \* b»
 * saldría en tres piezas y la aritmética de offsets de edit.ts marcaría el
 * trozo equivocado al aplicar una marca.
 */
function fusionarTexto(partes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const parte of partes) {
    const previa = out[out.length - 1];
    if (parte.kind === "text" && previa?.kind === "text") {
      out[out.length - 1] = { kind: "text", text: previa.text + parte.text };
      continue;
    }
    out.push(parte);
  }
  // Un único fragmento vacío es legítimo (línea en blanco); varios, no.
  return out.length > 1 ? out.filter((p) => !(p.kind === "text" && p.text === "")) : out;
}
```

- [ ] **Step 4: Escribir el serializador**

Añade al final de `markup.ts`:

```ts
/**
 * Inversa de `parseNote`. No devuelve el texto original byte a byte —
 * normaliza— sino un texto que vuelve a parsearse al MISMO árbol. Esa es la
 * propiedad que sostiene el editor: abrir una nota y guardarla no la deforma.
 */
export function serializeNote(blocks: Block[]): string {
  return blocks.map(serializeBlock).join("\n\n");
}

function serializeBlock(block: Block): string {
  switch (block.kind) {
    case "heading":
      return `${"#".repeat(block.level)} ${serializeInline(block.content)}`;
    case "bullets":
      return block.items.map((item) => `- ${serializeInline(item)}`).join("\n");
    case "ordered":
      return block.items.map((item, i) => `${i + 1}. ${serializeInline(item)}`).join("\n");
    case "quote":
      return serializeInline(block.content)
        .split("\n")
        .map((linea) => `> ${linea}`)
        .join("\n");
    default:
      // Un párrafo conserva sus saltos internos (ver parseNote), y cada línea
      // se protege por separado: basta con que UNA empiece por «#» para que al
      // volver a parsear se parta el párrafo en dos bloques.
      return serializeInline(block.content).split("\n").map(escaparInicioDeLinea).join("\n");
  }
}

/** Caracteres que, al inicio de una línea, la convertirían en otro bloque.
 *
 *  El lookahead de espacio en `#` y en `*`/`-` NO es cosmético: espeja lo que
 *  exigen HEADING y BULLET. Sin él se escapa de más, y como `#` y `-` no están
 *  en ESCAPABLES, parseInline no deshace ese escape: un hashtag («#YOLO») o un
 *  guion pegado volverían con una barra invertida LITERAL delante, rompiendo
 *  el punto fijo. `>` y `|` no lo llevan a propósito: QUOTE acepta el espacio
 *  opcional (así que escapar `>` siempre hace falta) y `|` sí es escapable
 *  inline, así que su escape revierte solo. */
const INICIO_DE_BLOQUE = /^(\s*)(#(?=\s)|[>|]|[*-](?=\s)|\d+[.)]|```)/;

function escaparInicioDeLinea(linea: string): string {
  return linea.replace(INICIO_DE_BLOQUE, (_, sangria: string, marca: string) => {
    return `${sangria}\\${marca}`;
  });
}

export function escapeInlineText(text: string, opts?: { pipe?: boolean }): string {
  // La barra invertida va primero o se escaparían las que acabamos de meter.
  const escapado = text.replace(/\\/g, "\\\\").replace(/([`*~+[])/g, "\\$1");
  return opts?.pipe ? escapado.replace(/\|/g, "\\|") : escapado;
}

export function serializeInline(content: Inline[], opts?: { pipe?: boolean }): string {
  return content
    .map((parte) => {
      switch (parte.kind) {
        case "bold":
          return `**${escapeInlineText(parte.text, opts)}**`;
        case "italic":
          return `*${escapeInlineText(parte.text, opts)}*`;
        case "code":
          // Dentro de comillas invertidas nada se interpreta, así que escapar
          // ahí rompería el literal en vez de protegerlo.
          return `\`${parte.text}\``;
        case "link":
          return parte.text === parte.href
            ? parte.href
            : `[${escapeInlineText(parte.text, opts)}](${parte.href})`;
        default:
          return escapeInlineText(parte.text, opts);
      }
    })
    .join("");
}
```

- [ ] **Step 5: Enseñar a `parseNote` a respetar el escape de inicio de línea**

En `parseNote`, antes de probar `HEADING`/`BULLET`/`ORDERED`/`QUOTE`, deja pasar la línea escapada como párrafo. Sustituye el inicio del bucle `for (const raw of lines)`:

```ts
  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flush();
      continue;
    }

    // Una línea que empieza por `\` seguido de una marca de bloque es texto a
    // propósito: quien escribió «\# hola» quiere ver «# hola». parseInline
    // deshace el escape; aquí sólo hay que impedir que se lea como bloque.
    if (/^\s*\\[#>|*\-`]|^\s*\\\d/.test(line)) {
      if (bullets.length || ordered.length || quote.length) flush();
      paragraph.push(line);
      continue;
    }

    const heading = HEADING.exec(line);
```

- [ ] **Step 6: Correr las pruebas y ver que pasan**

Run: `node --experimental-strip-types --test tests/domain/notes-markup.test.ts`
Expected: PASS, incluidas las 15 pruebas que ya existían.

- [ ] **Step 7: Confirmar que no se rompió nada más**

Run: `pnpm typecheck && pnpm test:unit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/notes/markup.ts tests/domain/notes-markup.test.ts
git commit -m "El dialecto de las notas no sabía volver a texto"
```

---

### Task 2: Subrayado y tachado

**Files:**
- Modify: `src/lib/domain/notes/markup.ts`
- Modify: `src/app/(app)/notebooks/NoteBody.tsx`
- Test: `tests/domain/notes-markup.test.ts`

**Interfaces:**
- Consumes: `serializeInline`, `escapeInlineText`, `fusionarTexto` (Task 1).
- Produces: dos variantes nuevas del tipo `Inline`: `{ kind: "underline"; text: string }` y `{ kind: "strike"; text: string }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
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
```

Y añade al `CORPUS_ROUND_TRIP`:

```ts
  "++subrayado++ y ~~tachado~~ juntos",
  "un más + suelto y una tilde ~ suelta",
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --experimental-strip-types --test tests/domain/notes-markup.test.ts`
Expected: FAIL — el árbol devuelve `text` donde se esperaba `underline`.

- [ ] **Step 3: Añadir las variantes al tipo**

En `markup.ts`, dentro de `export type Inline`:

```ts
  | { kind: "underline"; text: string }
  | { kind: "strike"; text: string }
```

- [ ] **Step 4: Añadir las alternativas al patrón**

`++…++` y `~~…~~` van **después de la negrita y antes de la cursiva**, para que `**a**` no se lea como `*` + `*a*`:

```ts
const INLINE_PATTERN =
  /\\([\\`*~+[|])|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\+\+([^+\n]+)\+\+|~~([^~\n]+)~~|\*([^*\n]+)\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
```

Y en `parseInline`, actualiza el destructurado y las ramas:

```ts
    const [, escapado, code, bold, underline, strike, italic, linkText, linkHref, bareUrl] = match;

    if (escapado !== undefined) out.push({ kind: "text", text: escapado });
    else if (code !== undefined) out.push({ kind: "code", text: code });
    else if (bold !== undefined) out.push({ kind: "bold", text: bold });
    else if (underline !== undefined) out.push({ kind: "underline", text: underline });
    else if (strike !== undefined) out.push({ kind: "strike", text: strike });
    else if (italic !== undefined) out.push({ kind: "italic", text: italic });
```

- [ ] **Step 5: Serializar las dos marcas**

En `serializeInline`, antes de `case "code"`:

```ts
        case "underline":
          return `++${escapeInlineText(parte.text, opts)}++`;
        case "strike":
          return `~~${escapeInlineText(parte.text, opts)}~~`;
```

- [ ] **Step 6: Pintarlas en lectura**

En `NoteBody.tsx`, dentro de `renderInline`, antes de `case "code"`:

```tsx
      case "underline":
        return <u key={i}>{part.text}</u>;
      case "strike":
        return <s key={i}>{part.text}</s>;
```

- [ ] **Step 7: Correr y ver que pasan**

Run: `pnpm typecheck && node --experimental-strip-types --test tests/domain/notes-markup.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/notes/markup.ts src/app/\(app\)/notebooks/NoteBody.tsx tests/domain/notes-markup.test.ts
git commit -m "No se podía subrayar ni tachar en una nota"
```

---

### Task 3: Casillas

**Files:**
- Modify: `src/lib/domain/notes/markup.ts`
- Modify: `src/app/(app)/notebooks/NoteBody.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/domain/notes-markup.test.ts`

**Interfaces:**
- Consumes: `serializeInline`, `parseInline`.
- Produces: `{ kind: "todo"; items: { done: boolean; content: Inline[] }[] }` en `Block`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
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
```

Y al `CORPUS_ROUND_TRIP`:

```ts
  "- [ ] sin hacer\n- [x] hecha",
  "- [x] hecha\n- [ ]",
  "- viñeta normal\n\n- [ ] casilla",
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --experimental-strip-types --test tests/domain/notes-markup.test.ts`
Expected: FAIL — `bloques[0].kind` es `"bullets"`, no `"todo"`.

- [ ] **Step 3: Añadir el tipo y la expresión**

En `markup.ts`:

```ts
  | { kind: "todo"; items: { done: boolean; content: Inline[] }[] }
```

```ts
// TODO va ANTES que BULLET al probarse: «- [ ] x» encaja en las dos, y la
// casilla es la lectura más específica.
//
// El texto es OPCIONAL a propósito. El editor crea un ítem vacío en cada
// Enter, y al serializarlo sale «- [ ] » cuyo espacio final se pierde en el
// trimEnd() de parseNote: exigiendo texto, ese ítem volvería como una viñeta
// que dice «[ ]». Rompería el ida y vuelta en la interacción más común.
const TODO = /^[-*]\s+\[([ xX])\](?:\s+(.*))?$/;
```

- [ ] **Step 4: Acumular el bloque en `parseNote`**

Añade `let todos: { done: boolean; text: string }[] = [];` junto a los otros acumuladores, esta rama dentro de `flush()`:

```ts
    if (todos.length) {
      blocks.push({
        kind: "todo",
        items: todos.map((t) => ({ done: t.done, content: parseInline(t.text) }))
      });
      todos = [];
    }
```

y esta rama en el bucle, **antes** de la de `BULLET`:

```ts
    const casilla = TODO.exec(line);
    if (casilla) {
      if (paragraph.length || bullets.length || ordered.length || quote.length) flush();
      todos.push({ done: (casilla[1] ?? " ").toLowerCase() === "x", text: casilla[2] ?? "" });
      continue;
    }
```

Añade además `todos.length` a las condiciones `if (...) flush()` de las ramas de `BULLET`, `ORDERED`, `QUOTE` y del párrafo, para que una lista de casillas se cierre al empezar otra cosa.

- [ ] **Step 5: Serializar y resumir**

En `serializeBlock`:

```ts
    case "todo":
      return block.items
        .map((item) => `- [${item.done ? "x" : " "}] ${serializeInline(item.content)}`)
        .join("\n");
```

En `noteExcerpt`, dentro del `flatMap`, antes del `return` final:

```ts
      if (block.kind === "todo") return block.items.map((item) => inlineText(item.content));
```

Y `noteDisplayTitle` deja de quitar el marcado con una cadena de `replace`.
Esa cadena sólo conocía `HEADING` y `BULLET`, así que una nota sin título que
empiece por una casilla se mostraría como «[ ] pagar luz» en la lista de
cuadernos. Reusar el parser lo resuelve para **todos** los bloques a la vez,
incluidos los de las tareas 4 y 5:

```ts
export function noteDisplayTitle(title: string, body: string): string {
  const trimmed = title.trim();
  if (trimmed) return trimmed;

  // Reusar el parser en vez de quitar el marcado a mano: así cada bloque
  // nuevo del dialecto queda cubierto sin tocar esta función otra vez.
  const [primero] = parseNote(body);
  if (!primero) return NOTA_SIN_TITULO;

  const lineas =
    primero.kind === "bullets" || primero.kind === "ordered"
      ? primero.items
      : primero.kind === "todo"
        ? primero.items.map((item) => item.content)
        : primero.kind === "table"
          ? primero.head
          : primero.kind === "mono"
            ? [[{ kind: "text" as const, text: primero.text }]]
            : [primero.content];

  const clean = (inlineText(lineas[0] ?? []).split("\n")[0] ?? "").trim();
  if (!clean) return NOTA_SIN_TITULO;
  return clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean;
}
```

> **En ESTA tarea** escribe la función sin las ramas de `mono` ni `table`:
> esos tipos todavía no existen y TypeScript las rechazará. Añade la rama de
> `mono` en la Task 4 y la de `table` en la Task 5, junto a sus pruebas de
> `noteDisplayTitle`. El bloque de arriba es la forma FINAL, tras la Task 5.

- [ ] **Step 6: Pintarlas en lectura**

En `NoteBody.tsx`, un `case` nuevo en el `switch`. En lectura las casillas están **deshabilitadas**: marcarlas es escribir, y este componente es para quien no escribe.

```tsx
          case "todo":
            return (
              <ul key={i} className="nb-todo">
                {block.items.map((item, j) => (
                  <li key={j} className={item.done ? "hecha" : undefined}>
                    <input type="checkbox" checked={item.done} disabled readOnly />
                    <span>{renderInline(item.content)}</span>
                  </li>
                ))}
              </ul>
            );
```

- [ ] **Step 7: Estilos**

En `globals.css`, junto a las demás reglas `.nb-prose`:

```css
.nb-prose .nb-todo {
  list-style: none;
  margin-left: 0;
}
.nb-prose .nb-todo li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.nb-prose .nb-todo li.hecha span {
  text-decoration: line-through;
  color: var(--muted);
}
.nb-prose .nb-todo input {
  margin-top: 3px;
  flex: none;
}
```

- [ ] **Step 8: Correr y ver que pasan**

Run: `pnpm typecheck && pnpm test:unit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/domain/notes/markup.ts src/app/\(app\)/notebooks/NoteBody.tsx src/app/globals.css tests/domain/notes-markup.test.ts
git commit -m "Una lista de pendientes en una nota no se podía marcar"
```

---

### Task 4: Bloque monoespaciado

**Files:**
- Modify: `src/lib/domain/notes/markup.ts`
- Modify: `src/app/(app)/notebooks/NoteBody.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/domain/notes-markup.test.ts`

**Interfaces:**
- Produces: `{ kind: "mono"; text: string }` en `Block`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
test("parseNote: el bloque monoespaciado conserva su texto tal cual", () => {
  const bloques = parseNote("```\npnpm verify\n  sangrado\n```");
  assert.strictEqual(bloques.length, 1);
  const bloque = bloques[0] as Extract<Block, { kind: "mono" }>;
  assert.strictEqual(bloque.kind, "mono");
  // Nada se interpreta dentro: ni el marcado ni el escape.
  assert.strictEqual(bloque.text, "pnpm verify\n  sangrado");
});

test("parseNote: dentro del bloque monoespaciado el marcado NO se interpreta", () => {
  const bloque = parseNote("```\n**no es negrita**\n```")[0] as Extract<Block, { kind: "mono" }>;
  assert.strictEqual(bloque.text, "**no es negrita**");
});

test("parseNote: una valla sin cerrar termina con el cuerpo, no se come la nota", () => {
  const bloques = parseNote("texto\n\n```\nsin cerrar");
  assert.deepStrictEqual(
    bloques.map((b) => b.kind),
    ["paragraph", "mono"]
  );
});

test("parseNote: la etiqueta de lenguaje se ignora", () => {
  // El iPhone tampoco resalta sintaxis; aceptar la etiqueta obligaría a
  // decidir qué hacer con un lenguaje desconocido.
  const bloque = parseNote("```ts\nconst a = 1\n```")[0] as Extract<Block, { kind: "mono" }>;
  assert.strictEqual(bloque.text, "const a = 1");
});
```

Y al `CORPUS_ROUND_TRIP`:

```ts
  "```\npnpm verify\n```",
  "antes\n\n```\ncódigo\n```\n\ndespués",
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --experimental-strip-types --test tests/domain/notes-markup.test.ts`
Expected: FAIL — no existe el bloque `mono`.

- [ ] **Step 3: Implementar**

Tipo:

```ts
  | { kind: "mono"; text: string }
```

El bloque monoespaciado se maneja **fuera** de la lógica de acumuladores, porque su contenido no se parsea. Al principio del bucle de `parseNote`:

```ts
  let mono: string[] | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Dentro de una valla no se interpreta NADA: ni bloques, ni escapes, ni
    // marcado. Sólo se busca el cierre.
    if (mono !== null) {
      if (/^```/.test(line)) {
        blocks.push({ kind: "mono", text: mono.join("\n") });
        mono = null;
      } else {
        mono.push(raw);
      }
      continue;
    }

    if (/^```/.test(line)) {
      flush();
      mono = [];
      continue;
    }
```

Y **después** del bucle, antes del `flush()` final:

```ts
  // Una valla sin cerrar termina donde termina el cuerpo. Tragarse el resto
  // de la nota sería peor que cerrarla sola.
  if (mono !== null) blocks.push({ kind: "mono", text: mono.join("\n") });
```

Serialización:

```ts
    case "mono":
      return `\`\`\`\n${block.text}\n\`\`\``;
```

En `noteExcerpt`, dentro del `flatMap`:

```ts
      if (block.kind === "mono") return [block.text];
```

Y añade a `noteDisplayTitle` la rama que la Task 3 dejó pendiente, con su
prueba — sin esto, una nota sin título que empiece por una valla se titularía
con el nombre de reserva en vez de con su primera línea:

```ts
        : primero.kind === "mono"
          ? [[{ kind: "text" as const, text: primero.text }]]
```

```ts
test("noteDisplayTitle: una nota que empieza por bloque monoespaciado usa su primera línea", () => {
  assert.strictEqual(noteDisplayTitle("", "```\npnpm verify\n```"), "pnpm verify");
});
```

- [ ] **Step 4: Pintarlo en lectura**

En `NoteBody.tsx`:

```tsx
          case "mono":
            return (
              <pre key={i} className="nb-mono">
                <code>{block.text}</code>
              </pre>
            );
```

- [ ] **Step 5: Estilos**

```css
.nb-prose .nb-mono {
  margin: 10px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface-2, rgba(127, 127, 127, 0.1));
  overflow-x: auto;
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre;
}
```

- [ ] **Step 6: Correr y ver que pasan**

Run: `pnpm typecheck && pnpm test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/notes/markup.ts src/app/\(app\)/notebooks/NoteBody.tsx src/app/globals.css tests/domain/notes-markup.test.ts
git commit -m "Un comando pegado en una nota perdía su sangrado"
```

---

### Task 5: Tablas en el dialecto

Sólo el dialecto y la lectura. Editarlas es la Task 11.

**Files:**
- Modify: `src/lib/domain/notes/markup.ts`
- Modify: `src/app/(app)/notebooks/NoteBody.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/domain/notes-markup.test.ts`

**Interfaces:**
- Produces: `{ kind: "table"; head: Inline[][]; rows: Inline[][][] }` en `Block`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
test("parseNote: una tabla con encabezado y filas", () => {
  const bloques = parseNote("| Área | Entrega |\n|---|---|\n| Diseño | 12/9 |\n| Dev | 20/9 |");
  assert.strictEqual(bloques.length, 1);
  const tabla = bloques[0] as Extract<Block, { kind: "table" }>;
  assert.strictEqual(tabla.kind, "table");
  assert.deepStrictEqual(tabla.head, [
    [{ kind: "text", text: "Área" }],
    [{ kind: "text", text: "Entrega" }]
  ]);
  assert.strictEqual(tabla.rows.length, 2);
});

test("parseNote: una fila corta o larga se normaliza al ancho del encabezado", () => {
  // Sin esto, una fila desalineada rompería la rejilla del editor.
  const tabla = parseNote("| a | b |\n|---|---|\n| sola |\n| 1 | 2 | 3 |")[0] as Extract<
    Block,
    { kind: "table" }
  >;
  assert.deepStrictEqual(
    tabla.rows.map((fila) => fila.length),
    [2, 2]
  );
});

test("parseNote: la alineación se acepta pero no se guarda", () => {
  // Alinear columnas no está en el menú del iPhone; sostener un dato que
  // nadie puede cambiar es cómo se acumulan los formatos muertos.
  const tabla = parseNote("| a | b |\n|:---:|---:|\n| 1 | 2 |")[0] as Extract<
    Block,
    { kind: "table" }
  >;
  assert.strictEqual(tabla.kind, "table");
  assert.ok(!("align" in tabla));
});

test("parseNote: sin fila separadora NO es una tabla", () => {
  // Un párrafo con barras verticales es más común que una tabla a medias.
  const bloques = parseNote("| esto | es texto |");
  assert.deepStrictEqual(
    bloques.map((b) => b.kind),
    ["paragraph"]
  );
});

test("noteDisplayTitle: una nota que empieza por tabla se titula con su primera celda", () => {
  assert.strictEqual(noteDisplayTitle("", "| Área | Due |\n|---|---|\n| a | b |"), "Área");
});

test("serializeNote: la barra vertical dentro de una celda se escapa", () => {
  const tabla = parseNote("| a \\| b | c |\n|---|---|\n| 1 | 2 |")[0] as Extract<
    Block,
    { kind: "table" }
  >;
  assert.deepStrictEqual(tabla.head[0], [{ kind: "text", text: "a | b" }]);
  assert.ok(serializeNote([tabla]).includes("a \\| b"));
});
```

Y al `CORPUS_ROUND_TRIP`:

```ts
  "| Área | Entrega |\n|---|---|\n| Diseño | 12/9 |",
  "| a \\| b | c |\n|---|---|\n| 1 | 2 |",
  "texto\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nmás texto",
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --experimental-strip-types --test tests/domain/notes-markup.test.ts`
Expected: FAIL — el bloque sale como `paragraph`.

- [ ] **Step 3: Implementar el parseo**

Tipo:

```ts
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] }
```

Como el bloque necesita **mirar la línea siguiente** (la separadora), se maneja con un índice explícito en vez de con acumuladores. Cambia `for (const raw of lines)` por `for (let i = 0; i < lines.length; i++)` con `const raw = lines[i] ?? "";`.

> La rama del bloque monoespaciado que añadió la Task 4 se queda **tal cual y
> en el mismo sitio** (justo al empezar el cuerpo del bucle): sólo cambia
> cómo se recorre `lines`, no lo que hace dentro.

Y añade esta rama **antes** de la de `QUOTE`:

```ts
    // Una tabla exige DOS líneas: la de encabezado y la separadora. Sin la
    // segunda, un párrafo con barras verticales se leería como tabla.
    if (esFilaDeTabla(line) && esSeparadoraDeTabla(lines[i + 1] ?? "")) {
      flush();
      const head = celdasDeFila(line);
      const rows: Inline[][][] = [];
      let j = i + 2;
      while (j < lines.length && esFilaDeTabla(lines[j] ?? "")) {
        const celdas = celdasDeFila(lines[j] ?? "");
        // Ancho fijo = ancho del encabezado. Recorta lo que sobra y rellena
        // con celdas vacías lo que falta.
        rows.push(
          Array.from({ length: head.length }, (_, c) => celdas[c] ?? [{ kind: "text" as const, text: "" }])
        );
        j++;
      }
      blocks.push({ kind: "table", head, rows });
      i = j - 1;
      continue;
    }
```

Y los tres ayudantes, junto a las demás constantes:

```ts
const FILA_TABLA = /^\s*\|.*\|\s*$/;
// La separadora acepta `:` de alineación para no romper con Markdown pegado
// de fuera, pero la alineación se descarta al construir el bloque.
const SEPARADORA_TABLA = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;

function esFilaDeTabla(linea: string): boolean {
  return FILA_TABLA.test(linea) && !SEPARADORA_TABLA.test(linea);
}

function esSeparadoraDeTabla(linea: string): boolean {
  return SEPARADORA_TABLA.test(linea.trimEnd());
}

/**
 * Parte una fila en celdas por las barras verticales NO escapadas. El
 * `split` normal no vale: se llevaría por delante el `\|` de una celda que
 * contiene una barra a propósito.
 */
function celdasDeFila(linea: string): Inline[][] {
  const cuerpo = linea.trim().replace(/^\|/, "").replace(/\|$/, "");
  const celdas: string[] = [];
  let actual = "";
  for (let k = 0; k < cuerpo.length; k++) {
    const c = cuerpo[k];
    if (c === "\\" && cuerpo[k + 1] === "|") {
      actual += "\\|";
      k++;
      continue;
    }
    if (c === "|") {
      celdas.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  celdas.push(actual);
  return celdas.map((celda) => parseInline(celda.trim()));
}
```

- [ ] **Step 4: Serializar**

En `serializeBlock`:

```ts
    case "table": {
      const fila = (celdas: Inline[][]) =>
        `| ${celdas.map((c) => serializeInline(c, { pipe: true })).join(" | ")} |`;
      // La separadora se escribe siempre igual: sin alineación que sostener.
      const separadora = `|${block.head.map(() => "---").join("|")}|`;
      return [fila(block.head), separadora, ...block.rows.map(fila)].join("\n");
    }
```

En `noteExcerpt`, dentro del `flatMap`:

```ts
      if (block.kind === "table") {
        return [...block.head, ...block.rows.flat()].map(inlineText);
      }
```

Y la última rama pendiente de `noteDisplayTitle` (su prueba ya está en el
Step 1 de esta tarea). Con ésta, la función queda como el bloque completo que
muestra la Task 3:

```ts
        : primero.kind === "table"
          ? primero.head
```

- [ ] **Step 5: Pintarla en lectura**

En `NoteBody.tsx`. El contenedor con scroll propio es obligatorio: una tabla ancha no puede poner a scrollear la nota entera de lado.

```tsx
          case "table":
            return (
              <div key={i} className="nb-table-wrap">
                <table className="nb-table">
                  <thead>
                    <tr>
                      {block.head.map((celda, j) => (
                        <th key={j}>{renderInline(celda)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((fila, j) => (
                      <tr key={j}>
                        {fila.map((celda, k) => (
                          <td key={k}>{renderInline(celda)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
```

- [ ] **Step 6: Estilos**

```css
.nb-prose .nb-table-wrap {
  margin: 12px 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.nb-prose .nb-table {
  border-collapse: collapse;
  min-width: 100%;
}
.nb-prose .nb-table th,
.nb-prose .nb-table td {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  min-width: 96px;
}
.nb-prose .nb-table th {
  font-weight: 700;
  background: var(--surface-2, rgba(127, 127, 127, 0.08));
}
```

- [ ] **Step 7: Correr y ver que pasan**

Run: `pnpm typecheck && pnpm test:unit`
Expected: PASS. El corpus round-trip ya cubre los cinco bloques nuevos y los cinco viejos.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/notes/markup.ts src/app/\(app\)/notebooks/NoteBody.tsx src/app/globals.css tests/domain/notes-markup.test.ts
git commit -m "D-038 excluyó las tablas cuando el editor era un textarea"
```

---

### Task 6: Aritmética de offsets y marcas

Primer archivo de `edit.ts`. Puro, sin DOM ni React.

**Files:**
- Create: `src/lib/domain/notes/edit.ts`
- Create: `tests/domain/notes-edit.test.ts`

**Interfaces:**
- Consumes: los tipos `Inline` y `Block` de `markup.ts`.
- Produces:
  - `plainLength(content: Inline[]): number`
  - `sliceInlines(content: Inline[], start: number, end: number): Inline[]`
  - `type MarcaInline = "bold" | "italic" | "underline" | "strike" | "code"`
  - `applyMark(content: Inline[], start: number, end: number, mark: MarcaInline): Inline[]`
  - `hasMark(content: Inline[], start: number, end: number, mark: MarcaInline): boolean`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crea `tests/domain/notes-edit.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --experimental-strip-types --test tests/domain/notes-edit.test.ts`
Expected: FAIL — `Cannot find module .../edit.ts`.

- [ ] **Step 3: Implementar**

Crea `src/lib/domain/notes/edit.ts`:

```ts
// Operaciones del editor sobre el árbol de una nota.
//
// POR QUÉ VIVE APARTE DE markup.ts
// markup.ts es el DIALECTO: texto ⇄ árbol. Este archivo es la EDICIÓN:
// árbol ⇄ árbol. Separarlos deja que el dialecto se pruebe sin conocer el
// editor, y que el editor se pruebe sin navegador.
//
// POR QUÉ TODO ES PURO
// El cursor de un contenteditable es lo único que obliga a tocar el DOM. Si
// además la lógica de marcas y bloques viviera ahí, no habría forma de
// probarla. Aquí no hay DOM, no hay React y no hay estado: entra un árbol,
// sale un árbol, y las pruebas corren en node sin navegador.
//
// EL MODELO ES PLANO A PROPÓSITO
// `Inline` no tiene hijos, así que negrita Y cursiva a la vez no se pueden
// representar. Es la misma limitación que ya tenía el dialecto, y sostenerla
// aquí evita un árbol anidado que el serializador no sabría escribir.
import type { Block, Inline } from "./markup.ts";

export type MarcaInline = "bold" | "italic" | "underline" | "strike" | "code";

/** Largo del texto VISIBLE. El cursor vive en estas coordenadas. */
export function plainLength(content: Inline[]): number {
  return content.reduce((total, parte) => total + parte.text.length, 0);
}

/** Copia un fragmento cambiándole el texto y conservando lo demás (el href). */
function conTexto(parte: Inline, text: string): Inline {
  return parte.kind === "link" ? { ...parte, text } : { ...parte, text };
}

export function sliceInlines(content: Inline[], start: number, end: number): Inline[] {
  const out: Inline[] = [];
  let cursor = 0;
  for (const parte of content) {
    const inicio = cursor;
    const fin = cursor + parte.text.length;
    cursor = fin;
    const desde = Math.max(start, inicio);
    const hasta = Math.min(end, fin);
    if (hasta <= desde) continue;
    out.push(conTexto(parte, parte.text.slice(desde - inicio, hasta - inicio)));
  }
  return out;
}

export function hasMark(
  content: Inline[],
  start: number,
  end: number,
  mark: MarcaInline
): boolean {
  const tramo = sliceInlines(content, start, end);
  return tramo.length > 0 && tramo.every((parte) => parte.kind === mark);
}

/**
 * Aplica o quita una marca sobre [start, end). Alterna: si TODO el rango ya
 * la lleva, la quita — es lo que hace el botón B del iPhone.
 *
 * Los enlaces se dejan intactos: perder el destino al poner negrita sería
 * destruir información que el usuario no puede recuperar.
 */
export function applyMark(
  content: Inline[],
  start: number,
  end: number,
  mark: MarcaInline
): Inline[] {
  if (end <= start) return content;
  const quitar = hasMark(content, start, end, mark);

  const out: Inline[] = [];
  let cursor = 0;
  for (const parte of content) {
    const inicio = cursor;
    const fin = cursor + parte.text.length;
    cursor = fin;

    const antes = parte.text.slice(0, Math.max(0, Math.min(start, fin) - inicio));
    const dentroDesde = Math.max(start, inicio);
    const dentroHasta = Math.min(end, fin);
    const dentro =
      dentroHasta > dentroDesde ? parte.text.slice(dentroDesde - inicio, dentroHasta - inicio) : "";
    const despues = parte.text.slice(Math.max(0, Math.max(end, inicio) - inicio));

    if (antes) out.push(conTexto(parte, antes));
    if (dentro) {
      if (parte.kind === "link") out.push(conTexto(parte, dentro));
      else out.push({ kind: quitar ? "text" : mark, text: dentro });
    }
    if (despues) out.push(conTexto(parte, despues));
  }

  return fusionar(out);
}

/** Pega fragmentos contiguos del mismo tipo. Espeja a markup.ts. */
function fusionar(partes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const parte of partes) {
    const previa = out[out.length - 1];
    if (previa && previa.kind === parte.kind && parte.kind !== "link") {
      out[out.length - 1] = conTexto(previa, previa.text + parte.text);
      continue;
    }
    out.push(parte);
  }
  return out.length ? out : [{ kind: "text", text: "" }];
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `pnpm typecheck && node --experimental-strip-types --test tests/domain/notes-edit.test.ts`
Expected: PASS, 11 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/notes/edit.ts tests/domain/notes-edit.test.ts
git commit -m "Aplicar negrita a media palabra necesita aritmética, no un replace"
```

---

### Task 7: Operaciones de bloque

**Files:**
- Modify: `src/lib/domain/notes/edit.ts`
- Modify: `tests/domain/notes-edit.test.ts`

**Interfaces:**
- Consumes: `plainLength`, `sliceInlines` (Task 6).
- Produces:
  - `type BlockStyle = "title" | "heading" | "subheading" | "body" | "mono" | "quote" | "bullets" | "ordered" | "todo" | "table"`
  - `styleOf(block: Block): BlockStyle`
  - `setBlockStyle(block: Block, style: BlockStyle): Block`
  - `toggleTodo(block: Block, index: number): Block`
  - `splitBlock(block: Block, itemIndex: number, offset: number): [Block, Block]`
  - `mergeBlocks(a: Block, b: Block): Block | null`
  - `textoDeBloque(block: Block): Inline[][]` — las líneas editables de un bloque, en orden

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade a `tests/domain/notes-edit.test.ts` (y a su import: `styleOf`, `setBlockStyle`, `toggleTodo`, `splitBlock`, `mergeBlocks`; y `type Block` desde `markup.ts`):

```ts
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

test("mergeBlocks: Backspace al inicio funde dos párrafos", () => {
  assert.deepStrictEqual(mergeBlocks(parrafo("hola"), parrafo("mundo")), parrafo("holamundo"));
});

test("mergeBlocks: fundir con una tabla o un bloque monoespaciado NO se hace", () => {
  // No significa nada, y hacerlo destruiría la rejilla o el sangrado.
  assert.strictEqual(mergeBlocks(parrafo("a"), { kind: "mono", text: "x" }), null);
  assert.strictEqual(
    mergeBlocks({ kind: "table", head: [texto("a")], rows: [] }, parrafo("b")),
    null
  );
});

test("mergeBlocks: un párrafo absorbe el primer ítem de la lista siguiente", () => {
  const lista: Block = { kind: "bullets", items: [texto("uno"), texto("dos")] };
  assert.deepStrictEqual(mergeBlocks(parrafo("hola "), lista), parrafo("hola uno"));
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --experimental-strip-types --test tests/domain/notes-edit.test.ts`
Expected: FAIL — `styleOf is not exported`.

- [ ] **Step 3: Implementar**

Añade a `src/lib/domain/notes/edit.ts`:

```ts
export type BlockStyle =
  | "title"
  | "heading"
  | "subheading"
  | "body"
  | "mono"
  | "quote"
  | "bullets"
  | "ordered"
  | "todo"
  | "table";

/** Las líneas editables de un bloque, en el orden en que se ven. */
export function textoDeBloque(block: Block): Inline[][] {
  switch (block.kind) {
    case "bullets":
    case "ordered":
      return block.items;
    case "todo":
      return block.items.map((item) => item.content);
    case "table":
      return [...block.head, ...block.rows.flat()];
    case "mono":
      return [[{ kind: "text", text: block.text }]];
    default:
      return [block.content];
  }
}

export function styleOf(block: Block): BlockStyle {
  switch (block.kind) {
    case "heading":
      return block.level === 1 ? "title" : block.level === 2 ? "heading" : "subheading";
    case "bullets":
      return "bullets";
    case "ordered":
      return "ordered";
    case "todo":
      return "todo";
    case "quote":
      return "quote";
    case "mono":
      return "mono";
    case "table":
      return "table";
    default:
      return "body";
  }
}

function textoLlano(content: Inline[]): string {
  return content.map((p) => p.text).join("");
}

/**
 * Convierte un bloque a cualquier estilo. Es TOTAL a propósito: un caso sin
 * definir aquí es un caso que el editor resolvería improvisando en
 * producción. La regla que lo gobierna todo: nunca se pierde texto.
 */
export function setBlockStyle(block: Block, style: BlockStyle): Block {
  const lineas = textoDeBloque(block);
  const primera = lineas[0] ?? [{ kind: "text" as const, text: "" }];

  switch (style) {
    case "title":
      return { kind: "heading", level: 1, content: aplanar(lineas) };
    case "heading":
      return { kind: "heading", level: 2, content: aplanar(lineas) };
    case "subheading":
      return { kind: "heading", level: 3, content: aplanar(lineas) };
    case "quote":
      return { kind: "quote", content: aplanar(lineas) };
    case "bullets":
      return { kind: "bullets", items: lineas };
    case "ordered":
      return { kind: "ordered", items: lineas };
    case "todo":
      return { kind: "todo", items: lineas.map((content) => ({ done: false, content })) };
    case "mono":
      return { kind: "mono", text: lineas.map(textoLlano).join("\n") };
    case "table":
      // Una 2×2 con lo que había en la primera celda, como el iPhone.
      return {
        kind: "table",
        head: [primera, [{ kind: "text", text: "" }]],
        rows: [[[{ kind: "text", text: "" }], [{ kind: "text", text: "" }]]]
      };
    default:
      return { kind: "paragraph", content: aplanar(lineas) };
  }
}

/** Une varias líneas en una sola, separadas por salto — el párrafo lo respeta. */
function aplanar(lineas: Inline[][]): Inline[] {
  const out: Inline[] = [];
  lineas.forEach((linea, i) => {
    if (i > 0) out.push({ kind: "text", text: "\n" });
    out.push(...linea);
  });
  return out.length ? out : [{ kind: "text", text: "" }];
}

export function toggleTodo(block: Block, index: number): Block {
  if (block.kind !== "todo") return block;
  return {
    kind: "todo",
    items: block.items.map((item, i) => (i === index ? { ...item, done: !item.done } : item))
  };
}

/**
 * Enter. Devuelve los dos bloques resultantes. `itemIndex` es la línea dentro
 * del bloque (0 salvo en listas), `offset` la posición del cursor en ella.
 */
export function splitBlock(block: Block, itemIndex: number, offset: number): [Block, Block] {
  const lineas = textoDeBloque(block);
  const linea = lineas[itemIndex] ?? [];
  const izquierda = sliceInlines(linea, 0, offset);
  const derecha = sliceInlines(linea, offset, plainLength(linea));

  if (block.kind === "bullets" || block.kind === "ordered") {
    return [
      { kind: block.kind, items: [...lineas.slice(0, itemIndex), izquierda] },
      { kind: block.kind, items: [derecha, ...lineas.slice(itemIndex + 1)] }
    ];
  }

  if (block.kind === "todo") {
    return [
      { kind: "todo", items: block.items.slice(0, itemIndex).concat({ done: false, content: izquierda }) },
      {
        kind: "todo",
        items: [{ done: false, content: derecha }, ...block.items.slice(itemIndex + 1)]
      }
    ];
  }

  // Tras un encabezado, la línea siguiente nace como Cuerpo: es lo que hace
  // el iPhone y evita que un título se propague a todo lo que viene detrás.
  if (block.kind === "heading") {
    return [{ ...block, content: izquierda }, { kind: "paragraph", content: derecha }];
  }

  return [
    { ...block, content: izquierda } as Block,
    { ...block, content: derecha } as Block
  ];
}

/**
 * Backspace al inicio de `b`. Devuelve el bloque fundido, o `null` cuando
 * fundir no significa nada — con una tabla o un bloque monoespaciado, en cuyo
 * caso quien llama sólo mueve el foco.
 */
export function mergeBlocks(a: Block, b: Block): Block | null {
  if (a.kind === "table" || b.kind === "table") return null;
  if (a.kind === "mono" || b.kind === "mono") return null;

  const lineasA = textoDeBloque(a);
  const lineasB = textoDeBloque(b);
  const ultima = lineasA[lineasA.length - 1] ?? [];
  const primera = lineasB[0] ?? [];
  const fundida = [...ultima, ...primera];
  const resto = lineasB.slice(1);

  if (a.kind === "bullets" || a.kind === "ordered") {
    return { kind: a.kind, items: [...lineasA.slice(0, -1), fundida, ...resto] };
  }
  if (a.kind === "todo") {
    const items = a.items.slice(0, -1);
    const ultimoA = a.items[a.items.length - 1];
    return {
      kind: "todo",
      items: [
        ...items,
        { done: ultimoA?.done ?? false, content: fundida },
        ...resto.map((content) => ({ done: false, content }))
      ]
    };
  }

  return { ...a, content: aplanar([...lineasA.slice(0, -1), fundida, ...resto]) } as Block;
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `pnpm typecheck && node --experimental-strip-types --test tests/domain/notes-edit.test.ts`
Expected: PASS, 25 pruebas entre las dos tareas.

- [ ] **Step 5: Correr todo el dominio**

Run: `pnpm test:unit`
Expected: PASS. `markup.ts` no se tocó en esta tarea, así que su corpus round-trip debe seguir verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/notes/edit.ts tests/domain/notes-edit.test.ts
git commit -m "Cambiar de estilo un bloque no podía perder líneas por el camino"
```

---

> **Nota para quien ejecute las tareas 8 a 13.** Aquí se acaban las pruebas
> automáticas: `node:test` no tiene DOM y el spec decidió no meter `jsdom`.
> La verificación de estas tareas es `pnpm typecheck && pnpm lint && pnpm build`
> más la comprobación a mano que cada tarea lista. **No marques una tarea como
> hecha sin haber abierto el navegador.** Lo que se compruebe queda escrito en
> `docs/CHECKS.md` en la Task 14, bajo el Contrato de Honestidad.

### Task 8: EditableLine — el único contenteditable

**Files:**
- Create: `src/app/(app)/notebooks/EditableLine.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `Inline` de `markup.ts`.
- Produces:
```ts
export interface EditableLineProps {
  content: Inline[];
  onChange: (content: Inline[]) => void;      // al escribir; NO repinta
  onKey: (e: React.KeyboardEvent) => void;    // Enter/Backspace/flechas los ve NoteDoc
  onSelect: (start: number, end: number) => void;
  autoFocus?: boolean;
  caret?: number | null;                      // pedir un cursor concreto al repintar
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}
export default function EditableLine(props: EditableLineProps): JSX.Element
export function leerDom(el: HTMLElement): Inline[]     // exportado para reutilizar en el volcado
export function offsetDelCursor(el: HTMLElement): { start: number; end: number }
export function ponerCursor(el: HTMLElement, offset: number): void
```

- [ ] **Step 1: Escribir el componente**

```tsx
"use client";
// El ÚNICO contenteditable del proyecto. Todo lo demás lo rodea.
//
// LOS DOS REGÍMENES (spec §2)
// Escribir texto: el DOM manda. React pinta este nodo al montarlo y NO
// vuelve a tocarlo mientras tenga el foco. Cada `input` se lee recorriendo
// el DOM y se avisa hacia arriba, pero nunca se escribe de vuelta. Sin esto
// el cursor salta en cada tecla y el dictado de iOS se rompe.
//
// Dar formato: el modelo manda. Al recibir un `caret` distinto de null se
// repinta desde `content` y se restaura el cursor por offset. Ocurre en un
// toque, no en cada tecla.
//
// LA LISTA BLANCA
// Al leer el DOM no se confía en lo que haya. Se aceptan seis etiquetas y
// TODO lo demás colapsa a texto. Eso cubre el pegado desde Word o desde una
// web: el estilo se cae, el texto sobrevive. Es la garantía de D-038
// sostenida en el lado de la ENTRADA, que con un textarea no hacía falta.
import { useEffect, useRef } from "react";
import type { Inline } from "@/lib/domain/notes/markup.ts";

const ETIQUETAS: Record<string, Inline["kind"]> = {
  B: "bold",
  STRONG: "bold",
  I: "italic",
  EM: "italic",
  U: "underline",
  S: "strike",
  STRIKE: "strike",
  CODE: "code"
};

export function leerDom(el: HTMLElement): Inline[] {
  const out: Inline[] = [];

  function recorrer(nodo: Node, marca: Inline["kind"] | null, href: string | null) {
    if (nodo.nodeType === Node.TEXT_NODE) {
      const text = nodo.textContent ?? "";
      if (!text) return;
      if (href) out.push({ kind: "link", text, href });
      else out.push({ kind: marca ?? "text", text } as Inline);
      return;
    }
    if (nodo.nodeType !== Node.ELEMENT_NODE) return;

    const el = nodo as HTMLElement;
    // El salto de línea que mete el navegador dentro de un contenteditable.
    if (el.tagName === "BR") {
      out.push({ kind: "text", text: "\n" });
      return;
    }

    let marcaHija = marca;
    let hrefHijo = href;
    if (el.tagName === "A") {
      const destino = el.getAttribute("href") ?? "";
      // El esquema se valida AQUÍ además de en el parser: un `javascript:`
      // pegado no puede llegar al modelo por esta puerta.
      if (/^https?:\/\//i.test(destino)) hrefHijo = destino;
    } else if (ETIQUETAS[el.tagName]) {
      marcaHija = ETIQUETAS[el.tagName] ?? marca;
    }
    // Cualquier otra etiqueta (SPAN, DIV, FONT, lo que pegue el navegador)
    // no aporta marca: sus hijos se recorren y su estilo se pierde.

    for (const hijo of Array.from(el.childNodes)) recorrer(hijo, marcaHija, hrefHijo);
  }

  for (const hijo of Array.from(el.childNodes)) recorrer(hijo, null, null);

  // Fusiona contiguos iguales, igual que markup.ts, para que la aritmética
  // de offsets de edit.ts vea un fragmento por tramo.
  const fusionado: Inline[] = [];
  for (const parte of out) {
    const previa = fusionado[fusionado.length - 1];
    if (previa && previa.kind === parte.kind && parte.kind !== "link") {
      fusionado[fusionado.length - 1] = { ...previa, text: previa.text + parte.text };
      continue;
    }
    fusionado.push(parte);
  }
  return fusionado.length ? fusionado : [{ kind: "text", text: "" }];
}

/** Offsets del cursor en coordenadas de TEXTO VISIBLE, que es donde vive edit.ts. */
export function offsetDelCursor(el: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
  const rango = sel.getRangeAt(0);

  const medir = (nodo: Node, offset: number): number => {
    const antes = rango.cloneRange();
    antes.selectNodeContents(el);
    antes.setEnd(nodo, offset);
    return antes.toString().length;
  };

  const start = medir(rango.startContainer, rango.startOffset);
  const end = medir(rango.endContainer, rango.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/** Coloca el cursor en un offset de texto visible. */
export function ponerCursor(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const rango = document.createRange();
  let restante = offset;
  let colocado = false;

  const recorrer = (nodo: Node): void => {
    if (colocado) return;
    if (nodo.nodeType === Node.TEXT_NODE) {
      const largo = nodo.textContent?.length ?? 0;
      if (restante <= largo) {
        rango.setStart(nodo, restante);
        colocado = true;
        return;
      }
      restante -= largo;
      return;
    }
    for (const hijo of Array.from(nodo.childNodes)) recorrer(hijo);
  };
  recorrer(el);

  // Un bloque vacío no tiene nodo de texto donde apoyar el cursor.
  if (!colocado) rango.selectNodeContents(el);
  rango.collapse(true);
  sel.removeAllRanges();
  sel.addRange(rango);
}

function pintar(content: Inline[]): React.ReactNode {
  return content.map((parte, i) => {
    switch (parte.kind) {
      case "bold":
        return <b key={i}>{parte.text}</b>;
      case "italic":
        return <i key={i}>{parte.text}</i>;
      case "underline":
        return <u key={i}>{parte.text}</u>;
      case "strike":
        return <s key={i}>{parte.text}</s>;
      case "code":
        return <code key={i}>{parte.text}</code>;
      case "link":
        return (
          <a key={i} href={parte.href} rel="noopener noreferrer">
            {parte.text}
          </a>
        );
      default:
        return <span key={i}>{parte.text}</span>;
    }
  });
}

export default function EditableLine({
  content,
  onChange,
  onKey,
  onSelect,
  autoFocus,
  caret,
  readOnly,
  placeholder,
  className
}: EditableLineProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // El único momento en que React escribe en este nodo: cuando le piden un
  // cursor concreto (una marca aplicada, un deshacer). Mientras se escribe,
  // `caret` es null y este efecto no hace nada.
  useEffect(() => {
    const el = ref.current;
    if (!el || caret === null || caret === undefined) return;
    ponerCursor(el, caret);
  }, [caret, content]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div
      ref={ref}
      className={className}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="false"
      data-placeholder={placeholder}
      // Se escribe prosa, no identificadores (misma decisión que D-040).
      autoCapitalize="sentences"
      autoCorrect="on"
      spellCheck
      onInput={(e) => onChange(leerDom(e.currentTarget))}
      onKeyDown={onKey}
      onSelect={(e) => {
        const { start, end } = offsetDelCursor(e.currentTarget);
        onSelect(start, end);
      }}
      onPaste={(e) => {
        // Se pega SIEMPRE como texto llano. Dejar que el navegador inserte su
        // HTML y limpiarlo después deja restos distintos en cada navegador.
        e.preventDefault();
        const texto = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, texto);
      }}
    >
      {pintar(content)}
    </div>
  );
}
```

> `document.execCommand("insertText", …)` es la única excepción a «nada de
> `execCommand`» del spec, y es deliberada: es la forma de insertar texto
> conservando el undo nativo del navegador dentro del bloque, y su salida es
> texto llano, no marcado. Si un día desaparece, se sustituye por
> `Range.insertNode` sin tocar nada más.

- [ ] **Step 2: Estilos**

```css
.nb-line {
  outline: none;
  min-height: 1.65em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  -webkit-user-select: text;
}
.nb-line:empty::before,
.nb-line[data-empty="true"]::before {
  content: attr(data-placeholder);
  color: var(--muted);
  pointer-events: none;
}
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/notebooks/EditableLine.tsx src/app/globals.css
git commit -m "Escribir con formato en vivo exige un contenteditable, y sólo uno"
```

---

### Task 9: NoteDoc — foco, Enter, Backspace y autoformato

**Files:**
- Create: `src/app/(app)/notebooks/NoteDoc.tsx`

**Interfaces:**
- Consumes: `EditableLine` (Task 8), todo `edit.ts` (Tasks 6–7).
- Produces:
```ts
export interface Cursor { block: number; item: number; start: number; end: number }
export interface NoteDocProps {
  blocks: Block[];
  onChange: (blocks: Block[], cursor: Cursor) => void;
  cursor: Cursor;
  onCursor: (cursor: Cursor) => void;
  readOnly?: boolean;
}
export default function NoteDoc(props: NoteDocProps): JSX.Element
```

- [ ] **Step 1: Escribir el componente**

Las dos interfaces del bloque **Interfaces** de arriba (`Cursor` y
`NoteDocProps`) van declaradas y exportadas al principio de este archivo:
`NoteEditor` importa `Cursor` desde aquí en la Task 12.

```tsx
"use client";
// Recorre Block[] y pinta un EditableLine por línea. Es el dueño del FOCO y
// de todo lo que ocurre ENTRE bloques: Enter, Backspace al inicio, flechas
// en el borde y el autoformato al escribir.
//
// El estado vive arriba (NoteEditor) porque la pila de deshacer y el
// autoguardado lo necesitan. Aquí sólo se calculan bloques nuevos y se
// avisa, junto con dónde debe quedar el cursor.
import EditableLine from "./EditableLine";
import type { Block, Inline } from "@/lib/domain/notes/markup.ts";
import {
  mergeBlocks,
  plainLength,
  setBlockStyle,
  splitBlock,
  textoDeBloque,
  toggleTodo,
  type BlockStyle
} from "@/lib/domain/notes/edit.ts";

// Lo que convierte un bloque al vuelo mientras escribes. De aquí sale la
// sensación de rapidez, y sale casi gratis porque es una operación pura.
const ATAJOS: { patron: RegExp; estilo: BlockStyle }[] = [
  { patron: /^#\s$/, estilo: "title" },
  { patron: /^##\s$/, estilo: "heading" },
  { patron: /^###\s$/, estilo: "subheading" },
  { patron: /^[-*]\s$/, estilo: "bullets" },
  { patron: /^\d+[.)]\s$/, estilo: "ordered" },
  { patron: /^(\[\]|\[ \]|[-*]\s\[\s?\])\s$/, estilo: "todo" },
  { patron: /^>\s$/, estilo: "quote" }
];

export default function NoteDoc({ blocks, onChange, cursor, onCursor, readOnly }: NoteDocProps) {
  function reemplazar(indice: number, nuevos: Block[], cur: Cursor) {
    onChange([...blocks.slice(0, indice), ...nuevos, ...blocks.slice(indice + 1)], cur);
  }

  function alEscribir(bi: number, ii: number, content: Inline[]) {
    const bloque = blocks[bi];
    if (!bloque) return;

    // Autoformato: sólo en la primera línea de un párrafo y sólo si TODO lo
    // escrito hasta ahora es el atajo. Así «# » al empezar convierte, pero
    // «un # a media frase» no.
    const llano = content.map((p) => p.text).join("");
    if (bloque.kind === "paragraph" && ii === 0) {
      const atajo = ATAJOS.find((a) => a.patron.test(llano));
      if (atajo) {
        const vacio: Block = { kind: "paragraph", content: [{ kind: "text", text: "" }] };
        reemplazar(bi, [setBlockStyle(vacio, atajo.estilo)], { block: bi, item: 0, start: 0, end: 0 });
        return;
      }
    }

    reemplazar(bi, [conLinea(bloque, ii, content)], { ...cursor, block: bi, item: ii });
  }

  function alPulsar(e: React.KeyboardEvent, bi: number, ii: number) {
    const bloque = blocks[bi];
    if (!bloque || readOnly) return;
    const lineas = textoDeBloque(bloque);
    const linea = lineas[ii] ?? [];
    const largo = plainLength(linea);

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      // Enter en un ítem VACÍO sale de la lista. Sin esto, salir de una
      // viñeta en el móvil es imposible.
      const enLista = bloque.kind === "bullets" || bloque.kind === "ordered" || bloque.kind === "todo";
      if (enLista && largo === 0 && lineas.length > 1) {
        const sinUltimo = quitarLinea(bloque, ii);
        const parrafo: Block = { kind: "paragraph", content: [{ kind: "text", text: "" }] };
        reemplazar(bi, sinUltimo ? [sinUltimo, parrafo] : [parrafo], {
          block: bi + (sinUltimo ? 1 : 0),
          item: 0,
          start: 0,
          end: 0
        });
        return;
      }

      const [a, b] = splitBlock(bloque, ii, cursor.start);
      const mismaLista = enLista;
      reemplazar(bi, [a, b], {
        block: mismaLista ? bi : bi + 1,
        item: mismaLista ? textoDeBloque(a).length : 0,
        start: 0,
        end: 0
      });
      return;
    }

    if (e.key === "Backspace" && cursor.start === 0 && cursor.end === 0) {
      // Dentro del bloque: funde con la línea anterior del mismo bloque.
      if (ii > 0) {
        e.preventDefault();
        const anterior = lineas[ii - 1] ?? [];
        const fundida = [...anterior, ...linea];
        const sinLinea = quitarLinea(bloque, ii);
        if (sinLinea) {
          reemplazar(bi, [conLinea(sinLinea, ii - 1, fundida)], {
            block: bi,
            item: ii - 1,
            start: plainLength(anterior),
            end: plainLength(anterior)
          });
        }
        return;
      }
      // Al inicio del bloque: funde con el bloque anterior, si tiene sentido.
      const previo = blocks[bi - 1];
      if (!previo) return;
      e.preventDefault();
      const fundido = mergeBlocks(previo, bloque);
      const lineasPrevias = textoDeBloque(previo);
      const ultima = lineasPrevias[lineasPrevias.length - 1] ?? [];
      if (!fundido) {
        // Con una tabla o un bloque monoespaciado no se funde: sólo se mueve
        // el foco. Fundir ahí destruiría la rejilla o el sangrado.
        onCursor({ block: bi - 1, item: lineasPrevias.length - 1, start: plainLength(ultima), end: plainLength(ultima) });
        return;
      }
      onChange([...blocks.slice(0, bi - 1), fundido, ...blocks.slice(bi + 1)], {
        block: bi - 1,
        item: lineasPrevias.length - 1,
        start: plainLength(ultima),
        end: plainLength(ultima)
      });
      return;
    }

    if (e.key === "ArrowUp" && cursor.start === 0) {
      const destino = ii > 0 ? { block: bi, item: ii - 1 } : bi > 0 ? { block: bi - 1, item: textoDeBloque(blocks[bi - 1]!).length - 1 } : null;
      if (destino) {
        e.preventDefault();
        onCursor({ ...destino, start: 0, end: 0 });
      }
      return;
    }

    if (e.key === "ArrowDown" && cursor.start === largo) {
      const destino =
        ii < lineas.length - 1
          ? { block: bi, item: ii + 1 }
          : bi < blocks.length - 1
            ? { block: bi + 1, item: 0 }
            : null;
      if (destino) {
        e.preventDefault();
        onCursor({ ...destino, start: 0, end: 0 });
      }
    }
  }

  return (
    <div className="nb-doc nb-prose">
      {blocks.map((bloque, bi) => (
        <BloqueEditable
          key={bi}
          bloque={bloque}
          indice={bi}
          cursor={cursor}
          readOnly={readOnly}
          onEscribir={alEscribir}
          onPulsar={alPulsar}
          onSelect={(ii, start, end) => onCursor({ block: bi, item: ii, start, end })}
          onToggle={(ii) => reemplazar(bi, [toggleTodo(bloque, ii)], cursor)}
        />
      ))}
    </div>
  );
}
```

Y los dos ayudantes puros al final del archivo:

```tsx
/** Devuelve el bloque con una de sus líneas sustituida.
 *  Va exportada porque NoteEditor la reutiliza en la Task 12 para aplicar
 *  marcas y enlaces; duplicarla allí sería dos sitios que se desincronizan. */
export function conLinea(block: Block, indice: number, content: Inline[]): Block {
  switch (block.kind) {
    case "bullets":
    case "ordered":
      return { kind: block.kind, items: block.items.map((it, i) => (i === indice ? content : it)) };
    case "todo":
      return {
        kind: "todo",
        items: block.items.map((it, i) => (i === indice ? { ...it, content } : it))
      };
    case "mono":
      return { kind: "mono", text: content.map((p) => p.text).join("") };
    default:
      return { ...block, content } as Block;
  }
}

/** Quita una línea de un bloque; `null` si era la última que quedaba. */
function quitarLinea(block: Block, indice: number): Block | null {
  if (block.kind === "bullets" || block.kind === "ordered") {
    const items = block.items.filter((_, i) => i !== indice);
    return items.length ? { kind: block.kind, items } : null;
  }
  if (block.kind === "todo") {
    const items = block.items.filter((_, i) => i !== indice);
    return items.length ? { kind: "todo", items } : null;
  }
  return null;
}
```

- [ ] **Step 2: Escribir `BloqueEditable`**

En el mismo archivo. Pinta cada `kind` con su envoltorio y un `EditableLine` por línea. Las casillas llevan el `input` **fuera** del contenteditable, para que marcarla no sea escribir.

```tsx
function BloqueEditable({ bloque, indice, cursor, readOnly, onEscribir, onPulsar, onSelect, onToggle }: {
  bloque: Block;
  indice: number;
  cursor: Cursor;
  readOnly?: boolean;
  onEscribir: (bi: number, ii: number, content: Inline[]) => void;
  onPulsar: (e: React.KeyboardEvent, bi: number, ii: number) => void;
  onSelect: (ii: number, start: number, end: number) => void;
  onToggle: (ii: number) => void;
}) {
  const linea = (content: Inline[], ii: number, className: string, placeholder?: string) => (
    <EditableLine
      key={ii}
      className={`nb-line ${className}`}
      content={content}
      readOnly={readOnly}
      placeholder={placeholder}
      autoFocus={cursor.block === indice && cursor.item === ii}
      caret={cursor.block === indice && cursor.item === ii ? cursor.start : null}
      onChange={(c) => onEscribir(indice, ii, c)}
      onKey={(e) => onPulsar(e, indice, ii)}
      onSelect={(start, end) => onSelect(ii, start, end)}
    />
  );

  switch (bloque.kind) {
    case "heading": {
      const Tag = bloque.level === 1 ? "h2" : bloque.level === 2 ? "h3" : "h4";
      return <Tag>{linea(bloque.content, 0, `nb-h${bloque.level}`)}</Tag>;
    }
    case "quote":
      return <blockquote>{linea(bloque.content, 0, "nb-quote")}</blockquote>;
    case "mono":
      return (
        <pre className="nb-mono">
          {linea([{ kind: "text", text: bloque.text }], 0, "nb-mono-line")}
        </pre>
      );
    case "bullets":
      return <ul>{bloque.items.map((it, i) => <li key={i}>{linea(it, i, "")}</li>)}</ul>;
    case "ordered":
      return <ol>{bloque.items.map((it, i) => <li key={i}>{linea(it, i, "")}</li>)}</ol>;
    case "todo":
      return (
        <ul className="nb-todo">
          {bloque.items.map((it, i) => (
            <li key={i} className={it.done ? "hecha" : undefined}>
              {/* Fuera del contenteditable: marcar no es escribir, y así no
                  roba el foco ni hace saltar el teclado. */}
              <input
                type="checkbox"
                checked={it.done}
                disabled={readOnly}
                onChange={() => onToggle(i)}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={it.content.map((p) => p.text).join("") || "pendiente"}
              />
              {linea(it.content, i, "")}
            </li>
          ))}
        </ul>
      );
    case "table":
      // La edición de tablas entra en la Task 11. Hasta entonces NO puede caer
      // en el `default`: ese pinta `bloque.content`, propiedad que el bloque
      // `table` no tiene, y TypeScript falla al compilar esta tarea.
      return null;
    default:
      return <p>{linea(bloque.content, 0, "", indice === 0 ? "Escribe aquí…" : undefined)}</p>;
  }
}
```

> Una tabla no se ve entre esta tarea y la 11. Es un estado intermedio
> declarado, no un olvido: la Task 11 sustituye ese `return null`.

- [ ] **Step 3: Verificar que compila**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/notebooks/NoteDoc.tsx
git commit -m "Salir de una viñeta con el pulgar era imposible"
```

---

### Task 10: FormatBar y el anclaje sobre el teclado

**Files:**
- Create: `src/app/(app)/notebooks/FormatBar.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `BlockStyle`, `styleOf`, `MarcaInline`, `hasMark` (Tasks 6–7).
- Produces:
```ts
export interface FormatBarProps {
  estilo: BlockStyle;
  marcasActivas: MarcaInline[];
  onEstilo: (estilo: BlockStyle) => void;
  onMarca: (marca: MarcaInline) => void;
  onEnlace: () => void;
  onTabla: () => void;
  onDeshacer: () => void;
  onRehacer: () => void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
}
export default function FormatBar(props: FormatBarProps): JSX.Element
export function useAlturaTeclado(): number   // px que ocupa el teclado, 0 si no hay
```

- [ ] **Step 1: Escribir el hook del teclado**

```tsx
"use client";
import { useEffect, useState } from "react";

/**
 * Cuántos píxeles del viewport se está comiendo el teclado.
 *
 * POR QUÉ ESTO Y NO `position: fixed; bottom: 0`
 * En Safari de iOS el teclado NO reduce el viewport de layout, así que una
 * barra fija abajo se queda DEBAJO del teclado, invisible justo cuando se
 * necesita. `visualViewport` es la única fuente que sabe dónde está el borde
 * de verdad.
 *
 * D-040 dice que las acciones van arriba porque una barra abajo pelea con el
 * teclado, y sigue siendo cierto PARA LAS ACCIONES. La barra de formato es
 * otra cosa: actúa sobre la selección y tiene que estar donde está el pulgar.
 * Es una excepción acotada, no la derogación de D-040.
 */
export function useAlturaTeclado(): number {
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // Sin soporte, la barra se queda estática al final.

    function medir() {
      const teclado = window.innerHeight - (vv!.height + vv!.offsetTop);
      // Por debajo de 60px es ruido de la barra de direcciones, no un teclado.
      setAlto(teclado > 60 ? teclado : 0);
    }

    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, []);

  return alto;
}
```

- [ ] **Step 2: Escribir la barra**

En el mismo archivo. Los botones usan `onMouseDown` con `preventDefault` — sin eso, tocar un botón le quita el foco al contenteditable y **la selección se pierde antes de poder aplicarle nada**.

```tsx
const ESTILOS: { valor: BlockStyle; etiqueta: string }[] = [
  { valor: "title", etiqueta: "Título" },
  { valor: "heading", etiqueta: "Encabezado" },
  { valor: "subheading", etiqueta: "Subencabezado" },
  { valor: "body", etiqueta: "Cuerpo" },
  { valor: "mono", etiqueta: "Monoespaciado" },
  { valor: "quote", etiqueta: "Cita" }
];

const MARCAS: { valor: MarcaInline; etiqueta: string; titulo: string }[] = [
  { valor: "bold", etiqueta: "B", titulo: "Negrita" },
  { valor: "italic", etiqueta: "I", titulo: "Cursiva" },
  { valor: "underline", etiqueta: "U", titulo: "Subrayado" },
  { valor: "strike", etiqueta: "S", titulo: "Tachado" },
  { valor: "code", etiqueta: "‹›", titulo: "Monoespaciado" }
];

const LISTAS: { valor: BlockStyle; etiqueta: string; titulo: string }[] = [
  { valor: "bullets", etiqueta: "•", titulo: "Viñetas" },
  { valor: "ordered", etiqueta: "1.", titulo: "Numerada" },
  { valor: "todo", etiqueta: "☑", titulo: "Casillas" }
];

export default function FormatBar({
  estilo, marcasActivas, onEstilo, onMarca, onEnlace, onTabla,
  onDeshacer, onRehacer, puedeDeshacer, puedeRehacer
}: FormatBarProps) {
  const [abierto, setAbierto] = useState(false);
  const alturaTeclado = useAlturaTeclado();

  // Nunca robar el foco al contenteditable: sin esto, la selección se
  // deshace al tocar el botón y no queda nada a lo que aplicar la marca.
  const sinRobarFoco = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="nb-formatbar" style={{ bottom: alturaTeclado }} role="toolbar" aria-label="Formato">
      {abierto && (
        <div className="nb-formatbar-menu">
          {ESTILOS.map((e) => (
            <button
              key={e.valor}
              type="button"
              className={`nb-fb-estilo${estilo === e.valor ? " activo" : ""}`}
              onMouseDown={sinRobarFoco}
              onClick={() => { onEstilo(e.valor); setAbierto(false); }}
            >
              {e.etiqueta}
            </button>
          ))}
        </div>
      )}
      <div className="nb-formatbar-fila">
        <button type="button" className={`nb-fb${abierto ? " activo" : ""}`} onMouseDown={sinRobarFoco}
                onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} title="Estilo">Aa</button>
        <span className="nb-fb-sep" />
        {MARCAS.map((m) => (
          <button key={m.valor} type="button" title={m.titulo}
                  className={`nb-fb nb-fb-${m.valor}${marcasActivas.includes(m.valor) ? " activo" : ""}`}
                  aria-pressed={marcasActivas.includes(m.valor)}
                  onMouseDown={sinRobarFoco} onClick={() => onMarca(m.valor)}>{m.etiqueta}</button>
        ))}
        <span className="nb-fb-sep" />
        {LISTAS.map((l) => (
          <button key={l.valor} type="button" title={l.titulo}
                  className={`nb-fb${estilo === l.valor ? " activo" : ""}`}
                  onMouseDown={sinRobarFoco} onClick={() => onEstilo(l.valor)}>{l.etiqueta}</button>
        ))}
        <button type="button" className="nb-fb" title="Tabla" onMouseDown={sinRobarFoco} onClick={onTabla}>⊞</button>
        <button type="button" className="nb-fb" title="Enlace" onMouseDown={sinRobarFoco} onClick={onEnlace}>🔗</button>
        <span className="nb-fb-spacer" />
        <button type="button" className="nb-fb" title="Deshacer" disabled={!puedeDeshacer}
                onMouseDown={sinRobarFoco} onClick={onDeshacer}>↩︎</button>
        <button type="button" className="nb-fb" title="Rehacer" disabled={!puedeRehacer}
                onMouseDown={sinRobarFoco} onClick={onRehacer}>↪︎</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Estilos**

```css
.nb-formatbar {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 40;
  background: var(--surface);
  border-top: 1px solid var(--border);
  /* Sin teclado, la barra descansa sobre la zona de gestos del iPhone. */
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.nb-formatbar-fila {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  overflow-x: auto;
}
.nb-fb {
  min-width: 36px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  font-size: 15px;
}
.nb-fb.activo { background: var(--surface-2, rgba(127, 127, 127, 0.16)); font-weight: 700; }
.nb-fb:disabled { opacity: 0.35; }
.nb-fb-bold { font-weight: 800; }
.nb-fb-italic { font-style: italic; }
.nb-fb-underline { text-decoration: underline; }
.nb-fb-strike { text-decoration: line-through; }
.nb-fb-sep { width: 1px; height: 20px; background: var(--border); flex: none; }
.nb-fb-spacer { flex: 1 1 auto; }
.nb-formatbar-menu { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); }
.nb-fb-estilo { padding: 10px 14px; text-align: left; border: 0; background: transparent; color: var(--fg); }
.nb-fb-estilo.activo { background: var(--surface-2, rgba(127, 127, 127, 0.16)); }
/* El documento deja hueco para la barra: sin esto el último párrafo queda
   debajo y no se puede escribir en él. */
.nb-doc { padding-bottom: 96px; }
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/notebooks/FormatBar.tsx src/app/globals.css
git commit -m "La barra de formato quedaba debajo del teclado en iOS"
```

---

### Task 11: Tablas dentro del editor

**Files:**
- Modify: `src/app/(app)/notebooks/NoteDoc.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: el bloque `table` (Task 5), `EditableLine` (Task 8).
- Produces: nada nuevo hacia fuera; `BloqueEditable` deja de caer al `default` con `table`.

Las celdas se numeran en el mismo orden que `textoDeBloque`: primero el
encabezado de izquierda a derecha, luego las filas. Así el índice `item` del
cursor vale igual para una tabla que para una lista.

- [ ] **Step 1: Añadir el `case "table"` a `BloqueEditable`**

```tsx
    case "table": {
      const ancho = bloque.head.length;
      // Mismo orden que textoDeBloque: encabezado y luego filas.
      const indiceDe = (fila: number, col: number) => (fila === -1 ? col : ancho * (fila + 1) + col);
      return (
        <div className="nb-table-wrap">
          <table className="nb-table nb-table-edit">
            <thead>
              <tr>
                {bloque.head.map((celda, c) => (
                  <th key={c}>{linea(celda, indiceDe(-1, c), "nb-celda")}</th>
                ))}
                <th className="nb-table-ctl">
                  <button type="button" title="Añadir columna" onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onTabla(anadirColumna(bloque))}>＋</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {bloque.rows.map((fila, f) => (
                <tr key={f}>
                  {fila.map((celda, c) => (
                    <td key={c}>{linea(celda, indiceDe(f, c), "nb-celda")}</td>
                  ))}
                  <td className="nb-table-ctl">
                    <button type="button" title="Quitar fila" onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onTabla(quitarFila(bloque, f))}>−</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="nb-table-ctl" colSpan={ancho + 1}>
                  <button type="button" title="Añadir fila" onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onTabla(anadirFila(bloque))}>＋ Fila</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }
```

`BloqueEditable` recibe una prop más: `onTabla: (bloque: Block) => void`, que
en `NoteDoc` se cablea a `reemplazar(bi, [nuevo], cursor)`.

- [ ] **Step 2: Los tres ayudantes puros**

Al final de `NoteDoc.tsx`. Una celda vacía es un fragmento de texto vacío, no
un array vacío: `EditableLine` necesita algo que pintar.

```tsx
const CELDA_VACIA = (): Inline[] => [{ kind: "text", text: "" }];

function anadirColumna(t: Extract<Block, { kind: "table" }>): Block {
  return {
    kind: "table",
    head: [...t.head, CELDA_VACIA()],
    rows: t.rows.map((fila) => [...fila, CELDA_VACIA()])
  };
}

function anadirFila(t: Extract<Block, { kind: "table" }>): Block {
  return { kind: "table", head: t.head, rows: [...t.rows, t.head.map(CELDA_VACIA)] };
}

function quitarFila(t: Extract<Block, { kind: "table" }>, indice: number): Block {
  // Una tabla sin filas sigue siendo una tabla (encabezado solo); quitar la
  // última fila no debe dejar un bloque sin sentido.
  return { kind: "table", head: t.head, rows: t.rows.filter((_, i) => i !== indice) };
}
```

- [ ] **Step 3: Tab entre celdas**

En `alPulsar`, antes de la rama de `Enter`:

```tsx
    if (e.key === "Tab" && bloque.kind === "table") {
      e.preventDefault();
      const total = textoDeBloque(bloque).length;
      const siguiente = e.shiftKey ? ii - 1 : ii + 1;
      // Tab en la última celda crea fila, como en el iPhone.
      if (siguiente >= total) {
        reemplazar(bi, [anadirFila(bloque)], { block: bi, item: total, start: 0, end: 0 });
        return;
      }
      if (siguiente < 0) return;
      onCursor({ block: bi, item: siguiente, start: 0, end: 0 });
      return;
    }
```

Y en la rama de `Enter`, salir antes cuando el bloque es una tabla: dentro de
una celda, Enter no parte nada.

```tsx
    if (e.key === "Enter" && bloque.kind === "table") {
      e.preventDefault();
      return;
    }
```

- [ ] **Step 4: Cablear el botón ⊞ de la barra**

En `NoteEditor` (Task 12), `onTabla` de `FormatBar` llama a
`setBlockStyle(bloqueActual, "table")`. Aquí sólo hay que asegurarse de que
`BloqueEditable` recibe y usa la prop `onTabla`.

- [ ] **Step 5: Estilos de edición**

```css
/* Cualificados con .nb-prose para EMPATAR la especificidad de las reglas de
   la Task 5 (.nb-prose .nb-table th). Sin eso el `padding: 0` pierde y las
   celdas quedan con doble relleno: el de la celda y el del contenteditable. */
.nb-prose .nb-table-edit td,
.nb-prose .nb-table-edit th { padding: 0; }
.nb-prose .nb-table-edit .nb-celda { padding: 6px 10px; min-width: 96px; }
.nb-prose .nb-table-edit .nb-table-ctl { border: 0; width: 34px; text-align: center; }
.nb-table-ctl button {
  border: 0; background: transparent; color: var(--muted);
  width: 30px; height: 30px; border-radius: 6px; font-size: 14px;
}
```

- [ ] **Step 6: Verificar que compila**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/notebooks/NoteDoc.tsx src/app/globals.css
git commit -m "Una tabla escrita con barras verticales no la usa nadie en un móvil"
```

---

### Task 12: Integrar el editor y proteger el guardado

La primera tarea en la que el editor **funciona de verdad**: aquí se abre el
navegador. Se ordena antes que deshacer a propósito — deshacer sobre algo que
no se ve no se puede comprobar.

**Files:**
- Modify: `src/app/(app)/notebooks/NoteEditor.tsx`
- Modify: `src/app/(app)/notebooks/actions.ts:154-161`

**Interfaces:**
- Consumes: `NoteDoc` + `Cursor` (Tasks 9, 11), `FormatBar` (Task 10), `parseNote`/`serializeNote` (Tasks 1–5), `styleOf`/`setBlockStyle`/`applyMark`/`hasMark` (Tasks 6–7), `leerDom` (Task 8).
- Produces: nada nuevo. `saveNote` conserva su firma.

- [ ] **Step 1: Tope de tamaño en `saveNote`**

En `actions.ts`, dentro del esquema de zod:

```ts
      // Hoy escribir mucho cuesta escribirlo; con formato en vivo, pegar un
      // documento entero es un gesto. 256 KB son ~40.000 palabras: nadie
      // escribe eso en una nota, y quien lo pega no quería hacerlo.
      body: z.string().max(262_144, "La nota es demasiado larga para guardarse."),
```

Y para que el mensaje llegue al usuario en vez del genérico, sustituye la
línea del `if (!parsed.success)`:

```ts
  if (!parsed.success) {
    const primero = parsed.error.issues[0];
    return {
      ok: false,
      reason: primero?.message ?? "No se pudo guardar: los datos de la nota no son válidos."
    };
  }
```

- [ ] **Step 2: Reescribir el cuerpo de `NoteEditor`**

Se conservan **intactos**: `RETARDO_MS`, el tipo `Estado`, `guardar`,
`programar`, el efecto de `visibilitychange`, `EstadoGuardado`, las migas, la
firma y el borrado. Cambian el estado (`Block[]` en vez de `string`), el
volcado antes de guardar, y lo que se pinta.

```tsx
const [blocks, setBlocks] = useState<Block[]>(() => parseNote(note.body));
const [cursor, setCursor] = useState<Cursor>({ block: 0, item: 0, start: 0, end: 0 });
const docRef = useRef<HTMLDivElement | null>(null);

// El bloque enfocado es NO CONTROLADO (spec §2), así que el modelo va un paso
// por detrás del DOM mientras se escribe. Antes de serializar hay que leer el
// DOM de esa línea. En visibilitychange sobre todo: si bloqueas el teléfono a
// media palabra, sin esto se pierde exactamente lo último tecleado — que es
// el escenario que D-040 existe para proteger.
const volcarBloqueEnfocado = useCallback((actuales: Block[]): Block[] => {
  const el = docRef.current?.querySelector<HTMLElement>(".nb-line:focus");
  if (!el) return actuales;
  const bloque = actuales[cursor.block];
  if (!bloque) return actuales;
  return actuales.map((b, i) => (i === cursor.block ? conLinea(b, cursor.item, leerDom(el)) : b));
}, [cursor.block, cursor.item]);
```

`programar` deja de recibir `{ title, body }` en crudo y serializa:

```tsx
const programarDesde = useCallback(
  (siguientes: Block[], siguienteTitulo: string) => {
    programar({ title: siguienteTitulo, body: serializeNote(siguientes) });
  },
  [programar]
);
```

Y `guardar` vuelca antes de leer lo pendiente. En el cuerpo de `guardar`,
**antes** de `const pendiente = pendienteRef.current;`:

```tsx
    // Volcado de última hora: lo que hay en el DOM gana a lo que hay en el
    // modelo, porque el modelo puede ir una tecla por detrás.
    const frescos = volcarBloqueEnfocado(blocksRef.current);
    if (serializeNote(frescos) !== (pendienteRef.current?.body ?? "")) {
      pendienteRef.current = { title: tituloRef.current, body: serializeNote(frescos) };
    }
```

> `blocksRef`, `tituloRef` y `cursorRef` son `useRef` que se sincronizan en
> cada `setBlocks` / `setTitle` / `setCursor`. Van en refs y no en el estado
> por la misma razón que `versionRef` ya lo hace hoy: los usa el guardado
> diferido (y, en la Task 13, la pila de deshacer) y no queremos recrear el
> temporizador en cada tecla.
>
> ```tsx
> const blocksRef = useRef<Block[]>(blocks);
> const tituloRef = useRef(title);
> const cursorRef = useRef<Cursor>(cursor);
> useEffect(() => { blocksRef.current = blocks; }, [blocks]);
> useEffect(() => { tituloRef.current = title; }, [title]);
> useEffect(() => { cursorRef.current = cursor; }, [cursor]);
> ```
>
> El `import` de React de este archivo pasa a ser
> `useCallback, useEffect, useMemo, useRef, useState`.

- [ ] **Step 3: Sustituir lo que se pinta**

Fuera el conmutador «Editando / Vista», el `<textarea>` y el estado `leyendo`.
El rol Viewer nunca ve un `contenteditable`:

```tsx
        {canWrite ? (
          <div ref={docRef}>
            <input
              className="nb-title-input"
              value={title}
              onChange={(e) => { setTitle(e.target.value); programarDesde(blocks, e.target.value); }}
              onBlur={() => void guardar()}
              placeholder="Título de la nota"
              aria-label="Título de la nota"
              autoCapitalize="sentences"
              enterKeyHint="next"
            />
            <NoteDoc
              blocks={blocks}
              cursor={cursor}
              readOnly={estado === "conflicto"}
              onCursor={setCursor}
              onChange={(siguientes, cur) => {
                setBlocks(siguientes);
                setCursor(cur);
                programarDesde(siguientes, title);
              }}
            />
            <FormatBar
              estilo={styleOf(blocks[cursor.block] ?? { kind: "paragraph", content: [] })}
              marcasActivas={marcasActivas}
              onEstilo={aplicarEstilo}
              onMarca={aplicarMarca}
              onEnlace={ponerEnlace}
              onTabla={() => aplicarEstilo("table")}
              onDeshacer={() => {}}
              onRehacer={() => {}}
              puedeDeshacer={false}
              puedeRehacer={false}
            />
          </div>
        ) : (
          <article className="nb-read">
            <h2 className="nb-read-title">{encabezado}</h2>
            <NoteBody body={serializeNote(blocks)} />
          </article>
        )}
```

> Deshacer y rehacer quedan cableados a vacío y deshabilitados: los llena la
> Task 13. Es un estado intermedio conocido, no un olvido.

- [ ] **Step 4: Las tres acciones de la barra**

```tsx
  const marcasActivas = useMemo<MarcaInline[]>(() => {
    const bloque = blocks[cursor.block];
    if (!bloque || cursor.start === cursor.end) return [];
    const linea = textoDeBloque(bloque)[cursor.item] ?? [];
    return (["bold", "italic", "underline", "strike", "code"] as MarcaInline[]).filter((m) =>
      hasMark(linea, cursor.start, cursor.end, m)
    );
  }, [blocks, cursor]);

  function aplicarMarca(marca: MarcaInline) {
    const bloque = blocks[cursor.block];
    if (!bloque || cursor.start === cursor.end) return;
    const linea = textoDeBloque(bloque)[cursor.item] ?? [];
    const siguiente = conLinea(bloque, cursor.item, applyMark(linea, cursor.start, cursor.end, marca));
    const siguientes = blocks.map((b, i) => (i === cursor.block ? siguiente : b));
    setBlocks(siguientes);
    programarDesde(siguientes, title);
  }

  function aplicarEstilo(estilo: BlockStyle) {
    const bloque = blocks[cursor.block];
    if (!bloque) return;
    const siguientes = blocks.map((b, i) => (i === cursor.block ? setBlockStyle(bloque, estilo) : b));
    setBlocks(siguientes);
    setCursor({ ...cursor, item: 0, start: 0, end: 0 });
    programarDesde(siguientes, title);
  }

  function ponerEnlace() {
    const bloque = blocks[cursor.block];
    if (!bloque || cursor.start === cursor.end) return;
    const destino = window.prompt("Dirección del enlace (https://…)");
    // El esquema se valida aquí y en el parser. Un `javascript:` no se
    // construye ni por accidente ni a propósito.
    if (!destino || !/^https?:\/\//i.test(destino)) return;
    const linea = textoDeBloque(bloque)[cursor.item] ?? [];
    const texto = sliceInlines(linea, cursor.start, cursor.end).map((p) => p.text).join("");
    const nueva = [
      ...sliceInlines(linea, 0, cursor.start),
      { kind: "link" as const, text: texto, href: destino },
      ...sliceInlines(linea, cursor.end, plainLength(linea))
    ];
    const siguientes = blocks.map((b, i) => (i === cursor.block ? conLinea(b, cursor.item, nueva) : b));
    setBlocks(siguientes);
    programarDesde(siguientes, title);
  }
```

`conLinea` se exporta desde `NoteDoc.tsx` para reutilizarla aquí en vez de
duplicarla.

- [ ] **Step 5: Compilar y abrir el navegador**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

Run: `pnpm dev`, entra a un cuaderno y abre una nota. **Comprueba a mano:**

1. El texto con formato se ve formateado, sin asteriscos.
2. Escribir no hace saltar el cursor.
3. `# ` al inicio de una línea la convierte en título.
4. Enter en un ítem vacío sale de la lista.
5. Backspace al inicio de un párrafo lo funde con el anterior.
6. Seleccionar y tocar **B** pone negrita y el cursor no se pierde.
7. Marcar una casilla no hace saltar el teclado.
8. El estado de guardado pasa a «Guardado ✓» al parar de escribir.
9. **Recarga la página: el texto está.** Ábrela en `Vista` con otro rol
   (o pon `canWrite=false` a mano) y comprueba que se lee igual.
10. Abre una nota vieja escrita con el dialecto anterior y verifica que se ve
    igual que antes de este cambio.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/notebooks/NoteEditor.tsx src/app/\(app\)/notebooks/actions.ts
git commit -m "El editor de notas enseñaba la sintaxis en vez del formato"
```

---

### Task 13: Deshacer y rehacer

**Files:**
- Modify: `src/app/(app)/notebooks/NoteEditor.tsx`

**Interfaces:**
- Consumes: el estado `blocks`/`cursor` de Task 12.
- Produces: nada hacia fuera.

- [ ] **Step 1: La pila**

Al manejar nosotros el DOM se pierde el undo del navegador, así que va una
pila propia. Añade en `NoteEditor`:

```tsx
interface Instantanea { blocks: Block[]; cursor: Cursor }

// 50 y no ilimitada: una nota larga con instantáneas sin tope es una fuga de
// memoria en un teléfono.
const MAX_HISTORIA = 50;
// Escribir seguido no genera una entrada por tecla; se agrupa por pausa.
const AGRUPAR_MS = 500;

const pasado = useRef<Instantanea[]>([]);
const futuro = useRef<Instantanea[]>([]);
const ultimoApunte = useRef(0);
const [profundidad, setProfundidad] = useState({ atras: 0, adelante: 0 });

const apuntar = useCallback((anteriores: Block[], anteriorCursor: Cursor) => {
  const ahora = Date.now();
  // Dentro de la ventana de agrupación se sustituye la última entrada en vez
  // de apilar otra: así ⌘Z deshace una palabra, no una letra.
  if (ahora - ultimoApunte.current < AGRUPAR_MS && pasado.current.length) {
    ultimoApunte.current = ahora;
    return;
  }
  ultimoApunte.current = ahora;
  pasado.current = [...pasado.current, { blocks: anteriores, cursor: anteriorCursor }].slice(-MAX_HISTORIA);
  futuro.current = [];
  setProfundidad({ atras: pasado.current.length, adelante: 0 });
}, []);
```

- [ ] **Step 2: Apuntar en cada cambio**

Toda mutación de `blocks` pasa por un único sitio, para que no se olvide
ninguna. Eso incluye **el `onChange` de `NoteDoc`**, que es la vía por la que
entra lo que se escribe: si esa no apunta en la pila, deshacer no deshace
nada — el caso principal. Sustituye por `cambiar` los `setBlocks(...)` de
`onChange`, `aplicarMarca`, `aplicarEstilo` y `ponerEnlace`:

```tsx
const cambiar = useCallback(
  (siguientes: Block[], siguienteCursor?: Cursor) => {
    apuntar(blocksRef.current, cursorRef.current);
    setBlocks(siguientes);
    if (siguienteCursor) setCursor(siguienteCursor);
    programarDesde(siguientes, tituloRef.current);
  },
  [apuntar, programarDesde]
);
```

- [ ] **Step 3: Deshacer y rehacer**

```tsx
const deshacer = useCallback(() => {
  const previa = pasado.current[pasado.current.length - 1];
  if (!previa) return;
  pasado.current = pasado.current.slice(0, -1);
  futuro.current = [{ blocks: blocksRef.current, cursor: cursorRef.current }, ...futuro.current];
  setBlocks(previa.blocks);
  setCursor(previa.cursor);
  setProfundidad({ atras: pasado.current.length, adelante: futuro.current.length });
  programarDesde(previa.blocks, tituloRef.current);
}, [programarDesde]);

const rehacer = useCallback(() => {
  const siguiente = futuro.current[0];
  if (!siguiente) return;
  futuro.current = futuro.current.slice(1);
  pasado.current = [...pasado.current, { blocks: blocksRef.current, cursor: cursorRef.current }];
  setBlocks(siguiente.blocks);
  setCursor(siguiente.cursor);
  setProfundidad({ atras: pasado.current.length, adelante: futuro.current.length });
  programarDesde(siguiente.blocks, tituloRef.current);
}, [programarDesde]);
```

- [ ] **Step 4: El teclado**

```tsx
useEffect(() => {
  function alPulsar(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
    e.preventDefault();
    if (e.shiftKey) rehacer();
    else deshacer();
  }
  document.addEventListener("keydown", alPulsar);
  return () => document.removeEventListener("keydown", alPulsar);
}, [deshacer, rehacer]);
```

- [ ] **Step 5: Cablear la barra**

Sustituye las cuatro props vacías de la Task 12:

```tsx
              onDeshacer={deshacer}
              onRehacer={rehacer}
              puedeDeshacer={profundidad.atras > 0}
              puedeRehacer={profundidad.adelante > 0}
```

- [ ] **Step 6: Compilar y comprobar a mano**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

Con `pnpm dev`: escribe una frase, pulsa ↩︎ y comprueba que deshace **por
palabras y no por letras**; que ⌘Z hace lo mismo; que ↪︎ rehace; y que tras
deshacer, escribir algo nuevo vacía el futuro (↪︎ se deshabilita).

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/notebooks/NoteEditor.tsx
git commit -m "Al llevar nosotros el DOM se perdió el deshacer del navegador"
```

---

### Task 14: Decisiones y verificación honesta

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/CHECKS.md`
- Modify: `src/lib/domain/notes/markup.ts:1-20` (la cabecera)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada de código.

- [ ] **Step 1: Corregir la cabecera de `markup.ts`**

Hoy dice literalmente que un cuaderno *«necesita títulos, listas, negrita y
enlaces, no tablas ni notas al pie»*, y eso dejó de ser cierto. Sustituye el
bloque `POR QUÉ NO UNA LIBRERÍA` por:

```ts
// POR QUÉ NO UNA LIBRERÍA
// D-008 fija cero dependencias de runtime nuevas, y el dialecto que hace
// falta —títulos, listas, casillas, tablas, marcas y enlaces— cabe en este
// archivo, se prueba entero, y evita arrastrar un parser de Markdown completo
// (y su superficie de seguridad) al bundle del cliente. Las tablas entraron
// al convertirse el editor en WYSIWYG: dejaron de ser sintaxis que alguien
// teclea y pasaron a ser una rejilla que se toca.
//
// POR QUÉ ADEMÁS SERIALIZA
// El editor trabaja sobre el ÁRBOL, no sobre el texto, así que necesita la
// inversa. La propiedad que sostiene todo:
//     parse(serialize(parse(x))) ≡ parse(x)
// No devuelve el texto byte a byte —normaliza— sino un texto que vuelve al
// mismo árbol. Sin eso, abrir una nota y guardarla la deformaría.
```

- [ ] **Step 2: Tres decisiones en `docs/DECISIONS.md`**

Al final del archivo, con la numeración que siga a la última D existente.
**Comprueba el número antes de escribir**: `grep -o 'D-[0-9]\+' docs/DECISIONS.md | sort -u | tail -3`.

```markdown
### Notas con formato en vivo (septiembre 2026)

- **D-1NN Las tablas entran, y D-038 se amplía sólo en eso.** D-038 dijo que
  un cuaderno «no necesita tablas» y era un juicio correcto **para un
  textarea**: una tabla en sintaxis pipe, tecleada con el pulgar, no la usa
  nadie. Al pasar el editor a formato en vivo la tabla deja de ser sintaxis y
  pasa a ser una rejilla que se toca, y el argumento se cae. Lo que NO cambia
  de D-038 es lo que de verdad importaba: sigue sin haber librería de
  Markdown, sigue devolviendo un árbol y no HTML, y `NoteBody`/`EditableLine`
  siguen creando elementos de React. La lista blanca de `EditableLine`
  extiende esa misma garantía al lado de la ENTRADA, que con un textarea no
  hacía falta.

- **D-1NN La barra de formato va abajo; las acciones siguen arriba.** D-040
  puso las acciones arriba porque «una barra fija abajo pelea con el teclado y
  con la barra de gestos», y sigue siendo cierto para guardar, borrar y
  volver. La barra de formato es otra cosa: actúa sobre la selección y tiene
  que estar donde está el pulgar. Va anclada sobre el teclado leyendo
  `visualViewport.height`, porque en Safari de iOS el teclado no reduce el
  viewport de layout y un `bottom: 0` acaba DEBAJO del teclado. Sin soporte,
  cae a estática. **Es una excepción acotada a D-040, no su derogación.**

- **D-1NN Ni `execCommand` ni librería de editor: el modelo manda.** Las
  marcas se aplican con operaciones puras sobre el árbol (`edit.ts`) y luego
  se restaura el cursor por offset, en vez de pedirle al navegador que
  modifique el DOM. `execCommand` está deprecado y cada navegador escupe un
  HTML distinto; convertir ese HTML a nuestro dialecto sería el pantano que
  D-038 evitó. Una librería (Lexical, TipTap) lo resolvería, pero añade un
  peer de React —el riesgo `ERESOLVE` que D-008 existe para evitar— y aun así
  habría que serializar su modelo al nuestro. **D-008 sigue intacto: cero
  dependencias nuevas.** La única excepción es
  `document.execCommand("insertText")` al pegar, que inserta TEXTO LLANO y
  conserva el undo nativo dentro del bloque; su salida no es marcado.
```

- [ ] **Step 3: La lista de verificación manual en `docs/CHECKS.md`**

Lo que no se puede probar sin navegador va aquí, bajo el Contrato de
Honestidad. **Se rellena ejecutándola en un iPhone de verdad**, no
prediciendo el resultado.

```markdown
### Verificación: editor de notas con formato en vivo

Las pruebas de `tests/domain/notes-markup.test.ts` y `notes-edit.test.ts`
cubren el dialecto y las operaciones. Lo de abajo NO se puede probar sin
navegador (`node:test` no tiene DOM y no se añadió `jsdom`), así que se
comprueba a mano en Safari de iOS y se marca con el resultado real.

| # | Qué | Resultado |
|---|-----|-----------|
| 1 | El texto con formato se ve formateado, sin sintaxis | NO EJECUTADO |
| 2 | Escribir no hace saltar el cursor | NO EJECUTADO |
| 3 | El dictado por voz escribe donde está el cursor | NO EJECUTADO |
| 4 | `# ` y `- ` al inicio convierten el bloque | NO EJECUTADO |
| 5 | Enter en un ítem vacío sale de la lista | NO EJECUTADO |
| 6 | Backspace al inicio funde con el bloque anterior | NO EJECUTADO |
| 7 | Seleccionar y tocar B pone negrita sin perder la selección | NO EJECUTADO |
| 8 | Marcar una casilla no hace saltar el teclado | NO EJECUTADO |
| 9 | La barra de formato queda ENCIMA del teclado | NO EJECUTADO |
| 10 | Tab recorre las celdas de una tabla; en la última crea fila | NO EJECUTADO |
| 11 | Una tabla ancha scrollea sola, sin mover la nota | NO EJECUTADO |
| 12 | Pegar desde una web deja el texto y pierde el estilo | NO EJECUTADO |
| 13 | ↩︎ deshace por palabras, no por letras | NO EJECUTADO |
| 14 | Bloquear el móvil a media palabra NO pierde lo último escrito | NO EJECUTADO |
| 15 | Una nota escrita con el dialecto anterior se ve igual que antes | NO EJECUTADO |
| 16 | Con rol Viewer no aparece ningún `contenteditable` | NO EJECUTADO |
```

- [ ] **Step 4: Verificación completa**

Run: `pnpm verify`

> ⚠️ `pnpm verify` termina en `supabase db reset`, que **borra la base local**.
> Si tienes datos reales en local, corre por separado:
> `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build`.

Expected: PASS.

- [ ] **Step 5: Ejecutar la verificación manual y rellenar la tabla**

Abre la app en un iPhone (o en Safari con el simulador) y recorre los 16
puntos. **Cambia cada `NO EJECUTADO` por `EJECUTADO OK` o `FALLÓ` según lo que
pase de verdad.** Si algo falla, arréglalo antes de cerrar la tarea; si algo
no se puede comprobar, se queda en `NO EJECUTADO` y se dice por qué.

- [ ] **Step 6: Commit**

```bash
git add docs/DECISIONS.md docs/CHECKS.md src/lib/domain/notes/markup.ts
git commit -m "Las decisiones del editor no estaban escritas en ningún sitio"
```

---

## Verificación final del plan

Al terminar las 14 tareas:

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build
```

Y la tabla de `docs/CHECKS.md` sin ningún `NO EJECUTADO` sin explicar.

## Fuera de alcance (del spec, repetido aquí)

- Adjuntos (imágenes, archivos) — pide Supabase Storage y RLS de bucket.
- Fuente, tamaño y color arbitrarios — no caben en texto, y el iPhone tampoco
  los tiene.
- Arrastrar bloques para reordenar; plegar secciones.
- Limpiar la sintaxis de los fragmentos de búsqueda (`ts_headline` seguirá
  mostrando `## Acuerdos`). Ya pasa hoy.
- `LogbookCard`, `KnowledgeCard` y los paneles de comentarios: siguen con sus
  textareas.
