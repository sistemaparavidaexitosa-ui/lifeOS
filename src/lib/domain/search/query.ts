// src/lib/domain/search/query.ts
// La consulta de búsqueda — lógica pura, sin React ni Supabase (probada en
// tests/domain/search-query.test.ts).
//
// POR QUÉ ESTÁ AQUÍ Y NO EN EL COMPONENTE
// Separar `de:ana` del texto libre es exactamente la clase de cosa que se rompe
// callada: un filtro mal recortado no da error, solo devuelve resultados que
// parecen correctos. Y el mismo texto lo va a parsear la paleta y la búsqueda
// de la pantalla, así que si viviera en un componente acabaría copiado.

export type SearchKind = "project" | "task" | "comment" | "note" | "activity";

export interface ParsedQuery {
  /** Lo que va al tsquery. Vacío si solo se escribieron filtros. */
  text: string;
  kind: SearchKind | null;
  author: string | null;
  /** Exclusivo: `antes:2026-08-01` NO incluye el 1 de agosto. */
  beforeISO: string | null;
  /** Inclusivo: `desde:2026-08-01` sí incluye el 1 de agosto. */
  sinceISO: string | null;
  /** Filtros escritos que no se entendieron. La interfaz los dice en vez de ignorarlos. */
  unknown: string[];
}

/**
 * `tipo:` en vez del `en:` que se planeó.
 *
 * `en:` habría filtrado por el nombre del contenedor, y dentro de un espacio ya
 * acotado eso responde a una pregunta que casi nadie se hace. Lo que sí se
 * pregunta al buscar es «esto era una tarea o un comentario», y eso es `tipo:`.
 */
const KIND_ALIASES: Record<string, SearchKind> = {
  proyecto: "project",
  proyectos: "project",
  tarea: "task",
  tareas: "task",
  comentario: "comment",
  comentarios: "comment",
  nota: "note",
  notas: "note",
  actividad: "activity"
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parte el texto en filtros y términos.
 *
 * Un filtro es `clave:valor` sin espacios alrededor de los dos puntos. Todo lo
 * demás es texto de búsqueda, incluidas las palabras con dos puntos que no
 * correspondan a una clave conocida — «13:30» tiene que poder buscarse.
 */
export function parseQuery(raw: string): ParsedQuery {
  const parsed: ParsedQuery = { text: "", kind: null, author: null, beforeISO: null, sinceISO: null, unknown: [] };
  const words: string[] = [];

  for (const token of raw.split(/\s+/).filter(Boolean)) {
    const colon = token.indexOf(":");
    if (colon <= 0 || colon === token.length - 1) {
      words.push(token);
      continue;
    }

    const key = token.slice(0, colon).toLowerCase();
    const value = token.slice(colon + 1);

    switch (key) {
      case "tipo": {
        const kind = KIND_ALIASES[value.toLowerCase()];
        if (kind) parsed.kind = kind;
        else parsed.unknown.push(token);
        break;
      }
      case "de":
        parsed.author = value;
        break;
      case "antes":
        if (ISO_DATE.test(value)) parsed.beforeISO = value;
        else parsed.unknown.push(token);
        break;
      case "desde":
        if (ISO_DATE.test(value)) parsed.sinceISO = value;
        else parsed.unknown.push(token);
        break;
      default:
        // No es un filtro conocido: es texto. «13:30» se busca tal cual.
        words.push(token);
    }
  }

  parsed.text = words.join(" ").trim();
  return parsed;
}

/**
 * ¿Vale la pena consultar?
 *
 * Un solo carácter devuelve medio espacio y no ayuda a nadie. Pero si hay
 * filtros, con texto vacío la búsqueda SÍ tiene sentido: «tipo:nota de:ana» es
 * una pregunta legítima.
 */
export function isSearchable(parsed: ParsedQuery): boolean {
  if (parsed.text.length >= 2) return true;
  return parsed.text.length === 0 && Boolean(parsed.kind || parsed.author || parsed.beforeISO || parsed.sinceISO);
}

export interface SearchHitLike {
  kind: SearchKind;
  id: string;
  projectId: string | null;
  taskId: string | null;
  notebookId: string | null;
}

/**
 * A dónde lleva cada resultado.
 *
 * Un comentario no tiene pantalla propia: lleva a SU TAREA, con el drawer
 * abierto, que es donde se lee. Lo mismo la actividad, que lleva al proyecto
 * donde ocurrió.
 */
export function hitHref(hit: SearchHitLike, workspaceId: string): string {
  switch (hit.kind) {
    case "project":
      return `/execution?ws=${workspaceId}&project=${hit.id}`;
    case "task":
      return `/execution?ws=${workspaceId}&task=${hit.id}`;
    case "comment":
      return hit.taskId ? `/execution?ws=${workspaceId}&task=${hit.taskId}` : `/execution?ws=${workspaceId}`;
    case "note":
      return hit.notebookId
        ? `/notebooks?ws=${workspaceId}&notebook=${hit.notebookId}&note=${hit.id}`
        : `/notebooks?ws=${workspaceId}`;
    case "activity":
      return hit.projectId ? `/execution?ws=${workspaceId}&project=${hit.projectId}` : `/activity?ws=${workspaceId}`;
  }
}

export const KIND_LABEL: Record<SearchKind, string> = {
  project: "Proyecto",
  task: "Tarea",
  comment: "Comentario",
  note: "Nota",
  activity: "Actividad"
};
