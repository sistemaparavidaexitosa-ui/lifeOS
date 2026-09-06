// Subconjunto propio de Markdown para el cuerpo de una nota.
//
// POR QUÉ NO UNA LIBRERÍA
// D-008 fija cero dependencias de runtime nuevas, y aquí no hay motivo para
// romperlo: un cuaderno de equipo necesita títulos, listas, negrita y enlaces,
// no tablas ni notas al pie. Eso cabe en un archivo, se prueba entero, y evita
// arrastrar un parser de Markdown completo (y su superficie de seguridad) al
// bundle del cliente.
//
// POR QUÉ DEVUELVE DATOS Y NO HTML
// El cuerpo lo escribe un colaborador. Si esto produjera una cadena de HTML,
// alguien tendría que pintarla con `dangerouslySetInnerHTML` y una nota se
// convertiría en un vector de XSS contra todo su equipo. En su lugar devuelve
// un árbol que `NoteBody.tsx` recorre creando elementos de React: el texto
// nunca deja de ser texto. Es el mismo enfoque que `renderMentions` en
// TaskCommentsPanel.tsx, solo que más completo.
//
// Función pura a propósito — probada en tests/domain/notes-markup.test.ts sin
// necesidad de React ni de un DOM.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "underline"; text: string }
  | { kind: "strike"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "bullets"; items: Inline[][] }
  | { kind: "ordered"; items: Inline[][] }
  | { kind: "quote"; content: Inline[] }
  | { kind: "todo"; items: { done: boolean; content: Inline[] }[] };

/**
 * Un solo recorrido para todo lo que va dentro de una línea. El ORDEN de las
 * alternativas importa: `código` va primero para que un `**` dentro de un
 * fragmento de código se quede como texto, y el enlace explícito antes que el
 * enlace suelto para no partir un `[texto](url)` por la mitad.
 *
 * El esquema (`https?://`) está en la propia expresión, así que un `href` con
 * `javascript:` no puede llegar a construirse. Esa es la única defensa que hace
 * falta, y conviene que viva aquí y no en quien pinta.
 */
// El escape va PRIMERO: `\*` tiene que ganarle a `*`, o nunca se podría
// escribir un asterisco literal. El resto del orden es el de siempre —
// código antes que negrita, negrita antes que cursiva, enlace explícito
// antes que enlace suelto.
const ESCAPABLES = "\\`*~+[|";

const INLINE_PATTERN =
  /\\([\\`*~+[|])|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\+\+([^+\n]+)\+\+|~~([^~\n]+)~~|\*([^*\n]+)\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;

  // El regex es global y con estado; se reinicia en cada llamada para que dos
  // líneas seguidas no compartan lastIndex.
  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_PATTERN.exec(line)) !== null) {
    if (match.index > last) {
      out.push({ kind: "text", text: line.slice(last, match.index) });
    }
    const [, escapado, code, bold, underline, strike, italic, linkText, linkHref, bareUrl] = match;

    // Un carácter escapado es texto y nada más: se emite tal cual y la
    // fusión posterior lo pega al tramo que lo rodea.
    if (escapado !== undefined) out.push({ kind: "text", text: escapado });
    else if (code !== undefined) out.push({ kind: "code", text: code });
    else if (bold !== undefined) out.push({ kind: "bold", text: bold });
    else if (underline !== undefined) out.push({ kind: "underline", text: underline });
    else if (strike !== undefined) out.push({ kind: "strike", text: strike });
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

const HEADING = /^(#{1,3})\s+(.*)$/;
// TODO va ANTES que BULLET al probarse: «- [ ] x» encaja en las dos, y la
// casilla es la lectura más específica.
//
// El texto es OPCIONAL a propósito. El editor crea un ítem vacío en cada
// Enter, y al serializarlo sale «- [ ] » cuyo espacio final se pierde en el
// trimEnd() de parseNote: exigiendo texto, ese ítem volvería como una viñeta
// que dice «[ ]». Rompería el ida y vuelta en la interacción más común.
const TODO = /^[-*]\s+\[([ xX])\](?:\s+(.*))?$/;
const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

/**
 * Divide el cuerpo en bloques.
 *
 * Las líneas seguidas de un párrafo se conservan tal cual (unidas con `\n`) en
 * vez de fundirse en una sola: quien escribe una lista de nombres a saltos de
 * línea espera verlos en saltos de línea, no en un renglón corrido. Quien
 * pinta usa `white-space: pre-wrap` para respetarlo.
 */
export function parseNote(body: string): Block[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let bullets: string[] = [];
  let ordered: string[] = [];
  let quote: string[] = [];
  let todos: { done: boolean; text: string }[] = [];

  function flush() {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", content: parseInline(paragraph.join("\n")) });
      paragraph = [];
    }
    if (bullets.length) {
      blocks.push({ kind: "bullets", items: bullets.map(parseInline) });
      bullets = [];
    }
    if (ordered.length) {
      blocks.push({ kind: "ordered", items: ordered.map(parseInline) });
      ordered = [];
    }
    if (quote.length) {
      blocks.push({ kind: "quote", content: parseInline(quote.join("\n")) });
      quote = [];
    }
    if (todos.length) {
      blocks.push({
        kind: "todo",
        items: todos.map((t) => ({ done: t.done, content: parseInline(t.text) }))
      });
      todos = [];
    }
  }

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
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length as 1 | 2 | 3,
        content: parseInline(heading[2] ?? "")
      });
      continue;
    }

    const casilla = TODO.exec(line);
    if (casilla) {
      if (paragraph.length || bullets.length || ordered.length || quote.length) flush();
      todos.push({ done: (casilla[1] ?? " ").toLowerCase() === "x", text: casilla[2] ?? "" });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      if (paragraph.length || ordered.length || quote.length || todos.length) flush();
      bullets.push(bullet[1] ?? "");
      continue;
    }

    const numbered = ORDERED.exec(line);
    if (numbered) {
      if (paragraph.length || bullets.length || quote.length || todos.length) flush();
      ordered.push(numbered[1] ?? "");
      continue;
    }

    const quoted = QUOTE.exec(line);
    if (quoted) {
      if (paragraph.length || bullets.length || ordered.length || todos.length) flush();
      quote.push(quoted[1] ?? "");
      continue;
    }

    if (bullets.length || ordered.length || quote.length || todos.length) flush();
    paragraph.push(line);
  }

  flush();
  return blocks;
}

/**
 * Primeras líneas de una nota, para la tarjeta de la lista. Quita el marcado
 * en vez de pintarlo: `## Acuerdos` en un resumen de una línea se lee mejor
 * como "Acuerdos" que como "## Acuerdos".
 */
export function noteExcerpt(body: string, max = 140): string {
  const plain = parseNote(body)
    .flatMap((block) => {
      if (block.kind === "bullets" || block.kind === "ordered") return block.items.map(inlineText);
      if (block.kind === "todo") return block.items.map((item) => inlineText(item.content));
      return [inlineText(block.content)];
    })
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();

  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

function inlineText(content: Inline[]): string {
  return content.map((part) => part.text).join("");
}

/** Título que se muestra cuando la nota todavía no tiene uno. */
export const NOTA_SIN_TITULO = "Nota sin título";

/**
 * Título a mostrar. Si la nota no tiene título propio pero ya tiene cuerpo, se
 * usa su primera línea: obligar a titular antes de escribir es justo la
 * fricción que hace que nadie apunte nada en el móvil.
 */
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
        : [primero.content];

  const clean = (inlineText(lineas[0] ?? []).split("\n")[0] ?? "").trim();
  if (!clean) return NOTA_SIN_TITULO;
  return clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean;
}

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
    case "todo":
      return block.items
        .map((item) => `- [${item.done ? "x" : " "}] ${serializeInline(item.content)}`)
        .join("\n");
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

/**
 * Caracteres que, al inicio de una línea, la convertirían en otro bloque.
 * `*` y `-` sólo son peligrosos si BULLET los reconocería como tales, es
 * decir seguidos de espacio: sin el lookahead, un párrafo que EMPIEZA con
 * negrita («**negrita**...») escapaba el primer asterisco de más y el
 * ida-y-vuelta lo convertía en cursiva rota. Lo mismo le pasaba a `#`: sin su
 * propio lookahead, un hashtag («#YOLO») se escapaba de más aunque HEADING
 * exige espacio tras la almohadilla para leerse como título. `>` y `|` no
 * necesitan lookahead: QUOTE acepta el espacio opcional (cualquier `>` inicial
 * es un título de cita), y `|` sí revierte su escape en parseInline.
 */
const INICIO_DE_BLOQUE = /^(\s*)(#(?=\s)|[>|]|[*-](?=\s)|\d+[.)]|```)/;

function escaparInicioDeLinea(linea: string): string {
  return linea.replace(INICIO_DE_BLOQUE, (_, sangria: string, marca: string) => {
    return `${sangria}\\${marca}`;
  });
}

export function escapeInlineText(text: string, opts?: { pipe?: boolean }): string {
  // La barra invertida sólo necesita duplicarse cuando el carácter que la
  // sigue es uno de los que INLINE_PATTERN reconoce como escapable: si no lo
  // es (p. ej. una `#` suelta), una sola barra ya vuelve a parsearse como el
  // mismo texto literal, y duplicarla de más rompería la igualdad byte a byte
  // que exige «serializeNote: un párrafo que empieza como otro bloque se
  // escapa». Va primero o se escaparían las que acabamos de meter.
  const escapado = text.replace(/\\(?=[\\`*~+[|])/g, "\\\\").replace(/([`*~+[])/g, "\\$1");
  return opts?.pipe ? escapado.replace(/\|/g, "\\|") : escapado;
}

export function serializeInline(content: Inline[], opts?: { pipe?: boolean }): string {
  return content
    .map((parte) => {
      switch (parte.kind) {
        case "bold":
          return `**${escapeInlineText(parte.text, opts)}**`;
        case "underline":
          return `++${escapeInlineText(parte.text, opts)}++`;
        case "strike":
          return `~~${escapeInlineText(parte.text, opts)}~~`;
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
