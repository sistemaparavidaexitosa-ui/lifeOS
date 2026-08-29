import "server-only";
import { z } from "zod";
import {
  cleanIsbn,
  dedupeByTitle,
  fillGaps,
  normalizeGoogleBooks,
  normalizeOpenLibrary,
  type BookCandidate
} from "@/lib/domain/development/book-lookup.ts";

/**
 * Metadatos de libros desde Open Library y Google Books (§5.1 del spec del
 * módulo). Las dos APIs son públicas: sin OAuth, sin API key, sin tabla.
 * Todo por `fetch` directo, sin SDKs, para no tocar el set mínimo de
 * dependencias de runtime (D-008, precedente D-022 con Resend).
 *
 * REGLA DE ORO DE ESTE MÓDULO, igual que `sendEmail()` (D-021, §5.5 del
 * spec): **nunca lanza**. Un proveedor caído, una respuesta con otra forma o
 * un timeout devuelven `{ ok: false, reason }` y el usuario captura el libro
 * a mano, como siempre. Una integración opcional no puede tumbar la
 * biblioteca.
 */
export interface BookLookupResult {
  ok: boolean;
  candidates: BookCandidate[];
  /** Motivo legible cuando `ok` es false. La UI lo muestra tal cual. */
  reason?: string;
}

/** Ninguna búsqueda de metadatos justifica dejar una petición colgada. */
const TIMEOUT_MS = 6000;
const MAX_RESULTS = 5;

const openLibrarySchema = z.object({
  docs: z
    .array(
      z.object({
        title: z.string().optional(),
        author_name: z.array(z.string()).optional(),
        number_of_pages_median: z.number().optional(),
        cover_i: z.number().optional(),
        isbn: z.array(z.string()).optional(),
        subject: z.array(z.string()).optional()
      })
    )
    .default([])
});

const googleBooksSchema = z.object({
  items: z
    .array(
      z.object({
        volumeInfo: z
          .object({
            title: z.string().optional(),
            authors: z.array(z.string()).optional(),
            pageCount: z.number().optional(),
            imageLinks: z.object({ thumbnail: z.string().optional(), smallThumbnail: z.string().optional() }).optional(),
            industryIdentifiers: z.array(z.object({ type: z.string().optional(), identifier: z.string().optional() })).optional(),
            categories: z.array(z.string()).optional()
          })
          .optional()
      })
    )
    .default([])
});

/** `fetch` + zod en un solo lugar. Devuelve `null` ante cualquier problema. */
async function getJson<S extends z.ZodTypeAny>(url: string, schema: S): Promise<z.infer<S> | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": "LifeOS/0.1 (biblioteca personal)" },
      cache: "no-store"
    });
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    // Timeout, DNS, JSON inválido: todos son el mismo caso para el llamador.
    return null;
  }
}

async function searchOpenLibrary(term: string): Promise<BookCandidate[] | null> {
  // `fields` recorta la respuesta: el documento completo de Open Library trae
  // decenas de campos que aquí no se usan y solo cuestan ancho de banda.
  const url =
    `https://openlibrary.org/search.json?q=${encodeURIComponent(term)}` +
    // `subject` se pide explícitamente: sin él la respuesta no lo trae y no
    // habría con qué proponer la categoría del libro.
    `&fields=title,author_name,number_of_pages_median,cover_i,isbn,subject&limit=${MAX_RESULTS}`;
  const data = await getJson(url, openLibrarySchema);
  return data ? normalizeOpenLibrary(data.docs).slice(0, MAX_RESULTS) : null;
}

async function searchGoogleBooks(term: string): Promise<BookCandidate[] | null> {
  // Sin llave, Google Books responde contra una cuota anónima COMPARTIDA que
  // en la práctica se agota (429 "Quota exceeded ... per day" verificado el
  // 2026-08-23). Por eso es el secundario y no el primario, y por eso admite
  // una llave opcional: si existe, la búsqueda deja de depender de la suerte.
  // Perezosa y por feature (F11): nadie más la necesita y su ausencia no
  // rompe nada.
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url =
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(term)}&maxResults=${MAX_RESULTS}` +
    (apiKey ? `&key=${encodeURIComponent(apiKey)}` : "");
  const data = await getJson(url, googleBooksSchema);
  return data ? normalizeGoogleBooks(data.items).slice(0, MAX_RESULTS) : null;
}

/**
 * Busca por ISBN o por texto libre. Consulta ambos proveedores en paralelo:
 * Open Library manda (sin cuota declarada) y Google Books rellena lo que
 * aquel suele omitir, que es justo el total de páginas.
 */
export async function lookupBooks(rawQuery: string): Promise<BookLookupResult> {
  const query = rawQuery.trim();
  if (!query) return { ok: false, candidates: [], reason: "Escribe un título o un ISBN para buscar." };

  const isbn = cleanIsbn(query);
  const [openLibrary, googleBooks] = await Promise.all([
    searchOpenLibrary(isbn ? `isbn:${isbn}` : query),
    searchGoogleBooks(isbn ? `isbn:${isbn}` : query)
  ]);

  if (openLibrary === null && googleBooks === null) {
    return {
      ok: false,
      candidates: [],
      reason: "No se pudo consultar Open Library ni Google Books. Captura el libro a mano; el buscador es opcional."
    };
  }

  const candidates = openLibrary?.length
    ? fillGaps(dedupeByTitle(openLibrary), googleBooks ?? [])
    : dedupeByTitle(googleBooks ?? []);

  return { ok: true, candidates };
}
