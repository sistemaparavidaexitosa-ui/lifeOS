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
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "bullets"; items: Inline[][] }
  | { kind: "ordered"; items: Inline[][] }
  | { kind: "quote"; content: Inline[] };

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
const INLINE_PATTERN =
  /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;

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
    const [, code, bold, italic, linkText, linkHref, bareUrl] = match;

    if (code !== undefined) out.push({ kind: "code", text: code });
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
  // Una línea vacía sigue siendo una línea: devolver [] haría desaparecer el
  // párrafo entero en quien pinta.
  if (!out.length) out.push({ kind: "text", text: "" });
  return out;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
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
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flush();
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

    const bullet = BULLET.exec(line);
    if (bullet) {
      if (paragraph.length || ordered.length || quote.length) flush();
      bullets.push(bullet[1] ?? "");
      continue;
    }

    const numbered = ORDERED.exec(line);
    if (numbered) {
      if (paragraph.length || bullets.length || quote.length) flush();
      ordered.push(numbered[1] ?? "");
      continue;
    }

    const quoted = QUOTE.exec(line);
    if (quoted) {
      if (paragraph.length || bullets.length || ordered.length) flush();
      quote.push(quoted[1] ?? "");
      continue;
    }

    if (bullets.length || ordered.length || quote.length) flush();
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

  const firstLine = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return NOTA_SIN_TITULO;

  const clean = inlineText(parseInline(firstLine.replace(HEADING, "$2").replace(BULLET, "$1")));
  return clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean || NOTA_SIN_TITULO;
}
