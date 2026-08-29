"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { isAllowedCoverUrl, BOOK_CATEGORIES, type BookCategory } from "@/lib/domain/development/book-lookup.ts";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";

const bookSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional().default(""),
  status: z.enum(["Por leer", "Leyendo", "Terminado"]),
  currentPage: z.coerce.number().int().min(0).default(0),
  totalPages: z.coerce.number().int().min(0).default(0),
  // Categoría propia en español (migración 0034). El buscador de metadatos la
  // PROPONE; aquí llega ya confirmada o cambiada por el usuario.
  category: z.enum(BOOK_CATEGORIES as unknown as [BookCategory, ...BookCategory[]]).default("Otros"),
  // La portada la propone el buscador de metadatos (§5.1) y viaja en un input
  // oculto, así que aquí NO se confía en ella: solo pasan URLs https de los
  // hosts que la CSP permite pintar. Cualquier otra cosa se guarda como "sin
  // portada" en vez de rechazar el libro entero — el usuario vino a guardar
  // un libro, no a pelearse con una imagen.
  coverUrl: z
    .string()
    .optional()
    .default("")
    .transform((url) => (isAllowedCoverUrl(url) ? url : ""))
});

// Fix (post primera corrida real de `tsc` en CI, TS2769): el payload YA NO
// se tipa como `Record<string, unknown>` (eso hacía que TypeScript perdiera
// el tipo concreto de cada campo — incluyendo `title: string` — al hacer
// spread en el INSERT, generando "Property 'title' is missing"). Ahora usa
// una interfaz explícita con todos los campos tipados correctamente.
interface BookUpsertPayload {
  title: string;
  author: string;
  status: string;
  current_page: number;
  total_pages: number;
  category: string;
  cover_url: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

/**
 * FR-HAB-003: registrar/actualizar un libro de la biblioteca.
 *
 * NO LANZA (contrato de sendEmail(), D-021 / spec §5.5). Antes hacía
 * `throw new Error(error.message)` y en producción Next redactaba el mensaje,
 * dejando al usuario con "The specific message is omitted in production
 * builds" — indistinguible de un fallo de red. Ver src/lib/supabase/errors.ts.
 */
export async function upsertBook(id: string | null, formData: FormData): Promise<ActionResult> {
  const parsed = bookSchema.safeParse({
    title: formData.get("title"),
    author: formData.get("author") ?? "",
    status: formData.get("status"),
    currentPage: formData.get("currentPage") ?? 0,
    totalPages: formData.get("totalPages") ?? 0,
    category: formData.get("category") ?? "Otros",
    coverUrl: formData.get("coverUrl") ?? ""
  });
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "Datos del libro inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado." };

  const t0 = todayLocal(await getUserTimeZone());
  const book = parsed.data;
  const payload: BookUpsertPayload = {
    title: book.title,
    author: book.author,
    status: book.status,
    current_page: book.currentPage,
    total_pages: book.totalPages,
    category: book.category,
    cover_url: book.coverUrl,
    updated_at: new Date().toISOString()
  };

  let bookId = id;

  if (id) {
    const { data: prev } = await supabase.from("books").select("status, started_at, current_page").eq("id", id).single();
    if (book.status === "Leyendo" && prev?.status !== "Leyendo" && !prev?.started_at) payload.started_at = t0;
    if (book.status === "Terminado") payload.finished_at = t0;
    const { error } = await supabase.from("books").update(payload).eq("id", id);
    if (error) return actionFailed(error);
  } else {
    payload.started_at = book.status === "Leyendo" ? t0 : null;
    const { data: creado, error } = await supabase.from("books").insert({ ...payload, user_id: user.id }).select("id").single();
    if (error) return actionFailed(error);
    bookId = creado?.id ?? null;
  }

  // HISTORIAL DE LECTURA (migración 0034).
  //
  // `books.current_page` se sobrescribe, así que sin este punto no queda rastro
  // de a qué velocidad avanzas y la fecha estimada nunca puede mejorar. Se
  // escribe un punto por día local: el `unique (book_id, local_date)` hace que
  // actualizar cinco veces hoy deje solo el último valor, que es justo lo que
  // necesita el cálculo de ritmo (ver src/lib/domain/development/reading.ts).
  //
  // Falla en silencio a propósito: el usuario vino a guardar un libro, y
  // perder un punto del historial no justifica devolverle un error sobre algo
  // que ni sabe que existe.
  if (bookId && book.currentPage > 0) {
    await supabase
      .from("book_progress")
      .upsert({ book_id: bookId, local_date: t0, page: book.currentPage }, { onConflict: "book_id,local_date" });
  }

  // La auditoría es un efecto secundario: que falle no invalida el guardado
  // del libro, que ya ocurrió. No se propaga al usuario.
  await supabase.from("audit_log").insert({ user_id: user.id, action: "book.update", object: id ?? "" });
  revalidatePath("/development/library");
  revalidatePath("/home");
  return actionOk;
}

export async function deleteBook(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) return actionFailed(error);
  revalidatePath("/development/library");
  revalidatePath("/home");
  return actionOk;
}

/** FR-HAB-004: agregar una nota de lectura asociada a una página. */
export async function addBookNote(bookId: string, pageRef: number, text: string): Promise<ActionResult> {
  if (!text.trim()) return { ok: false, reason: "La nota está vacía." };
  const supabase = await createClient();
  const { error } = await supabase.from("book_notes").insert({ book_id: bookId, page_ref: pageRef, text: text.trim() });
  if (error) return actionFailed(error);
  revalidatePath("/development/library");
  return actionOk;
}
