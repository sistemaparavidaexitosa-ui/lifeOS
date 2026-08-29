// src/lib/domain/execution/mentions.ts
// Menciones en un comentario — lógica pura, sin React ni Supabase (probada en
// tests/domain/execution-mentions.test.ts).
//
// POR QUÉ NO BASTA CON UN REGEX
// El parseo original vivía suelto dentro de la Server Action:
// `body.match(/@([\wÀ-ÿ]+)/g)`. Funciona hasta que alguien se llama con dos
// palabras: «@Luis Varsa» captura «Luis», que no es nadie. Y aunque acertara, un
// nombre no identifica a una persona — dos «Ana» en el mismo espacio reciben el
// mismo aviso.
//
// La solución no es un regex mejor: es dejar de adivinar. La interfaz ofrece el
// roster del espacio y el usuario elige de una lista, así que este módulo casa
// el texto contra nombres CONOCIDOS, del más largo al más corto, y devuelve los
// ids. Si el nombre no está en el roster, no hay mención: no se inventa una.

export interface RosterMember {
  userId: string;
  name: string;
}

export interface ParsedMentions {
  /** Ids, sin repetir y en el orden en que aparecen en el texto. */
  userIds: string[];
  /** Los nombres casados, para seguir alimentando `comments.mentions`. */
  names: string[];
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Los nombres del roster que aparecen precedidos de `@` en el texto.
 *
 * Se prueban de MÁS LARGO A MÁS CORTO por la misma razón que `pseudonymize` en
 * el motor ordena así sus alias: con «Ana» y «Ana María» en el mismo espacio,
 * empezar por el corto casaría «@Ana María» como «Ana» y dejaría « María»
 * suelto. El largo primero gana siempre, y es el que el usuario eligió.
 */
export function parseMentions(body: string, roster: readonly RosterMember[]): ParsedMentions {
  const ordered = [...roster]
    .filter((m) => m.name.trim().length > 1)
    .sort((a, b) => b.name.length - a.name.length);

  const found: { at: number; member: RosterMember }[] = [];
  const claimed: boolean[] = new Array(body.length).fill(false);
  const seen = new Set<string>();

  for (const member of ordered) {
    if (seen.has(member.userId)) continue;
    const needle = `@${member.name}`;
    let from = 0;
    for (;;) {
      const at = body.indexOf(needle, from);
      if (at === -1) break;
      from = at + needle.length;

      // Un tramo ya reclamado por un nombre más largo no se vuelve a contar:
      // sin esto, «@Ana María» produciría también una mención a «Ana».
      if (claimed.slice(at, at + needle.length).some(Boolean)) continue;

      // El `@` tiene que ABRIR palabra: en «luis@Ana.com» ese arroba es parte de
      // un correo, no una mención. Lo destapó una prueba — `mentionQueryAt` sí
      // lo comprobaba y esta función no, que es justo la clase de divergencia
      // que aparece cuando la misma regla se escribe dos veces.
      const before = body[at - 1];
      if (before !== undefined && WORD_CHAR.test(before)) continue;

      // Y el nombre tiene que TERMINAR donde termina la palabra. Si no, «@Ana»
      // casaría dentro de «@Anabel».
      const next = body[at + needle.length];
      if (next !== undefined && WORD_CHAR.test(next)) continue;

      for (let i = at; i < at + needle.length; i++) claimed[i] = true;
      found.push({ at, member });
      seen.add(member.userId);
      break; // una mención por persona: repetir el nombre no avisa dos veces
    }
  }

  found.sort((a, b) => a.at - b.at);
  return {
    userIds: found.map((f) => f.member.userId),
    names: found.map((f) => f.member.name)
  };
}

/**
 * Los tramos en que se parte un comentario para pintarlo: texto plano y
 * menciones resueltas. Se calcula aquí y no en el componente porque es el mismo
 * problema de casado que arriba, y una segunda implementación se desviaría.
 */
export type BodySegment = { kind: "text"; text: string } | { kind: "mention"; text: string; userId: string };

export function splitBody(body: string, roster: readonly RosterMember[]): BodySegment[] {
  const { names, userIds } = parseMentions(body, roster);
  if (!names.length) return body ? [{ kind: "text", text: body }] : [];

  const segments: BodySegment[] = [];
  let cursor = 0;

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const userId = userIds[i];
    if (!name || !userId) continue;
    const needle = `@${name}`;
    const at = body.indexOf(needle, cursor);
    if (at === -1) continue;
    if (at > cursor) segments.push({ kind: "text", text: body.slice(cursor, at) });
    segments.push({ kind: "mention", text: needle, userId });
    cursor = at + needle.length;
  }

  if (cursor < body.length) segments.push({ kind: "text", text: body.slice(cursor) });
  return segments;
}

/**
 * El fragmento que se está escribiendo tras un `@`, para filtrar el roster
 * mientras se teclea. `null` cuando el cursor no está dentro de una mención.
 *
 * Acepta espacios —los nombres los tienen— pero se corta en el segundo: nadie
 * del roster se llama con tres palabras que haga falta teclear enteras para que
 * la lista se reduzca, y sin ese tope cualquier frase tras un `@` mantendría el
 * menú abierto hasta el final del comentario.
 */
export function mentionQueryAt(body: string, caret: number): string | null {
  const upto = body.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;

  // El `@` tiene que abrir palabra: un correo («luis@casa») no es una mención.
  const before = upto[at - 1];
  if (before !== undefined && WORD_CHAR.test(before)) return null;

  const fragment = upto.slice(at + 1);
  if (fragment.includes("\n")) return null;
  if (fragment.split(" ").length > 2) return null;
  return fragment;
}

/** El roster que encaja con lo tecleado. Sin acentos y sin mayúsculas. */
export function matchRoster(roster: readonly RosterMember[], query: string): RosterMember[] {
  const fold = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const needle = fold(query.trim());
  if (!needle) return [...roster];
  return roster.filter((m) => fold(m.name).includes(needle));
}
