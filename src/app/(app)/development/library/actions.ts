"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { isAllowedCoverUrl } from "@/lib/domain/development/book-lookup.ts";

const bookSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional().default(""),
  status: z.enum(["Por leer", "Leyendo", "Terminado"]),
  currentPage: z.coerce.number().int().min(0).default(0),
  totalPages: z.coerce.number().int().min(0).default(0),
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
  cover_url: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

/** FR-HAB-003: registrar/actualizar un libro de la biblioteca. */
export async function upsertBook(id: string | null, formData: FormData) {
  const parsed = bookSchema.parse({
    title: formData.get("title"),
    author: formData.get("author") ?? "",
    status: formData.get("status"),
    currentPage: formData.get("currentPage") ?? 0,
    totalPages: formData.get("totalPages") ?? 0,
    coverUrl: formData.get("coverUrl") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const t0 = todayLocal(await getUserTimeZone());
  const payload: BookUpsertPayload = {
    title: parsed.title,
    author: parsed.author,
    status: parsed.status,
    current_page: parsed.currentPage,
    total_pages: parsed.totalPages,
    cover_url: parsed.coverUrl,
    updated_at: new Date().toISOString()
  };

  if (id) {
    const { data: prev } = await supabase.from("books").select("status, started_at").eq("id", id).single();
    if (parsed.status === "Leyendo" && prev?.status !== "Leyendo" && !prev?.started_at) payload.started_at = t0;
    if (parsed.status === "Terminado") payload.finished_at = t0;
    const { error } = await supabase.from("books").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    payload.started_at = parsed.status === "Leyendo" ? t0 : null;
    const { error } = await supabase.from("books").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }

  await supabase.from("audit_log").insert({ user_id: user.id, action: "book.update", object: id ?? "" });
  revalidatePath("/development/library");
  revalidatePath("/home");
}

export async function deleteBook(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/library");
  revalidatePath("/home");
}

/** FR-HAB-004: agregar una nota de lectura asociada a una página. */
export async function addBookNote(bookId: string, pageRef: number, text: string) {
  if (!text.trim()) return;
  const supabase = await createClient();
  const { error } = await supabase.from("book_notes").insert({ book_id: bookId, page_ref: pageRef, text: text.trim() });
  if (error) throw new Error(error.message);
  revalidatePath("/development/library");
}
