// src/lib/domain/development/book-lookup.ts
// Búsqueda de metadatos de libros — lógica pura, sin React, sin Supabase y
// sin `fetch` (probada en tests/domain/development-book-lookup.test.ts).
//
// Aquí vive TODO lo que decide qué es un buen candidato: cómo se limpia un
// ISBN, cómo se lee la respuesta de cada proveedor y cómo se completa un
// candidato con lo que el otro sí trajo. La capa de red
// (src/lib/integrations/books.ts) solo trae el JSON y lo valida; no decide
// nada. Así el comportamiento se prueba sin salir a internet.

/** Un candidato ya normalizado, listo para prellenar el formulario. */
export interface BookCandidate {
  title: string;
  author: string;
  /** 0 cuando el proveedor no lo trae — el usuario lo completa a mano. */
  totalPages: number;
  /** Cadena vacía cuando no hay portada; nunca `http:` (ver `secureImageUrl`). */
  coverUrl: string;
  /** ISBN-13 o ISBN-10 normalizado, si el proveedor lo trajo. */
  isbn: string;
  source: "openlibrary" | "googlebooks";
}

/**
 * Un ISBN se teclea y se copia con guiones, espacios y a veces con la `x`
 * final en minúscula. Se normaliza a mayúsculas sin separadores y se rechaza
 * lo que no tenga forma de ISBN-10/13, para no mandar basura al proveedor.
 */
export function cleanIsbn(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(compact)) return compact;
  if (/^\d{13}$/.test(compact)) return compact;
  return null;
}

/**
 * Las miniaturas de Google Books llegan con esquema `http:`. Una CSP que
 * permite `https://books.google.com` NO permite la versión `http:`, así que
 * la portada se vería rota sin este ajuste. Cualquier otro esquema
 * (`data:`, `javascript:`) se descarta: esta URL termina en un `src`.
 */
export function secureImageUrl(raw: string | undefined | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  return "";
}

/** Forma mínima de un documento de `openlibrary.org/search.json`. */
export interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  number_of_pages_median?: number;
  cover_i?: number;
  isbn?: string[];
}

export function normalizeOpenLibrary(docs: OpenLibraryDoc[]): BookCandidate[] {
  return docs
    .filter((d): d is OpenLibraryDoc & { title: string } => Boolean(d.title))
    .map((d) => ({
      title: d.title,
      author: d.author_name?.[0] ?? "",
      totalPages: d.number_of_pages_median && d.number_of_pages_median > 0 ? Math.round(d.number_of_pages_median) : 0,
      // Las portadas de Open Library se sirven por id de portada, no por URL
      // en la respuesta: se arma aquí. `-M` es la talla mediana (~180px).
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : "",
      isbn: d.isbn?.map(cleanIsbn).find((i): i is string => i !== null) ?? "",
      source: "openlibrary" as const
    }));
}

/** Forma mínima de un volumen de `googleapis.com/books/v1/volumes`. */
export interface GoogleBooksVolume {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    pageCount?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
}

export function normalizeGoogleBooks(volumes: GoogleBooksVolume[]): BookCandidate[] {
  return volumes
    .map((v) => v.volumeInfo)
    .filter((info): info is NonNullable<GoogleBooksVolume["volumeInfo"]> & { title: string } => Boolean(info?.title))
    .map((info) => ({
      title: info.title,
      author: info.authors?.[0] ?? "",
      totalPages: info.pageCount && info.pageCount > 0 ? info.pageCount : 0,
      coverUrl: secureImageUrl(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
      isbn:
        info.industryIdentifiers
          ?.map((i) => (i.identifier ? cleanIsbn(i.identifier) : null))
          .find((i): i is string => i !== null) ?? "",
      source: "googlebooks" as const
    }));
}

/**
 * Open Library es el proveedor primario (sin cuota, sin credenciales), pero es
 * justo el que más seguido omite el número de páginas. En vez de mostrar dos
 * listas de resultados al usuario —que tendría que decidir cuál "es el mismo
 * libro"—, se completa el primario con el primer candidato del secundario que
 * comparta ISBN, o con el primero a secas cuando ninguno trae ISBN.
 *
 * Nunca sustituye un dato bueno: solo rellena huecos (`0` y `""`).
 */
export function fillGaps(primary: BookCandidate[], secondary: BookCandidate[]): BookCandidate[] {
  if (!secondary.length) return primary;
  return primary.map((cand) => {
    if (cand.totalPages > 0 && cand.coverUrl) return cand;
    const match =
      (cand.isbn && secondary.find((s) => s.isbn === cand.isbn)) ||
      (secondary.length === 1 && primary.length === 1 ? secondary[0] : undefined);
    if (!match) return cand;
    return {
      ...cand,
      totalPages: cand.totalPages > 0 ? cand.totalPages : match.totalPages,
      coverUrl: cand.coverUrl || match.coverUrl
    };
  });
}

/**
 * Una búsqueda por ISBN suele devolver el mismo libro varias veces: la edición
 * buena y registros flacos con solo el título. Se conserva el más completo de
 * cada título y se tiran los demás, en vez de hacer que el usuario adivine
 * cuál de dos filas idénticas es la que trae datos.
 *
 * Nunca colapsa títulos distintos, y respeta el orden en que llegaron: el
 * proveedor ya ordenó por relevancia y esta función no sabe más que él.
 */
export function dedupeByTitle(candidates: BookCandidate[]): BookCandidate[] {
  const richness = (c: BookCandidate) => (c.totalPages > 0 ? 1 : 0) + (c.coverUrl ? 1 : 0) + (c.author ? 1 : 0);
  const best = new Map<string, BookCandidate>();
  for (const candidate of candidates) {
    const key = candidate.title.trim().toLowerCase();
    const previous = best.get(key);
    if (!previous || richness(candidate) > richness(previous)) best.set(key, candidate);
  }
  return [...best.values()];
}

/**
 * Hosts de portada que la app acepta guardar. Es la misma lista que `img-src`
 * en `middleware.ts` y las dos tienen que moverse juntas: una URL fuera de
 * esta lista se guardaría bien y luego el navegador la bloquearía, dejando un
 * hueco silencioso en la biblioteca.
 *
 * Se valida en el servidor al guardar, no solo al buscar: el candidato llega
 * por un `<input hidden>` y eso lo puede editar cualquiera.
 */
export const COVER_HOSTS = ["covers.openlibrary.org", "books.google.com"] as const;

export function isAllowedCoverUrl(raw: string): boolean {
  if (!raw) return true; // vacío = sin portada, es un valor válido
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (COVER_HOSTS as readonly string[]).includes(url.hostname);
  } catch {
    return false;
  }
}
