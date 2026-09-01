"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal, weekStartISO } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { isAllowedCoverUrl, BOOK_CATEGORIES, type BookCategory } from "@/lib/domain/development/book-lookup.ts";
import { planWeeks, MAX_PLAN_WEEKS } from "@/lib/domain/development/reading-plan.ts";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";

/**
 * Las tres pantallas donde aparece el libro foco. Cualquier acción que mueva
 * página o plan tiene que revalidar las tres, o el Panel enseñaría un libro y
 * Home otro hasta la siguiente navegación.
 */
function revalidarLectura() {
  revalidatePath("/development/library");
  revalidatePath("/development");
  revalidatePath("/home");
}

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

  if (bookId) await registrarPunto(supabase, bookId, book.currentPage, t0);

  // La auditoría es un efecto secundario: que falle no invalida el guardado
  // del libro, que ya ocurrió. No se propaga al usuario.
  await supabase.from("audit_log").insert({ user_id: user.id, action: "book.update", object: id ?? "" });
  revalidarLectura();
  return actionOk;
}

/**
 * HISTORIAL DE LECTURA (migración 0034).
 *
 * `books.current_page` se sobrescribe, así que sin este punto no queda rastro
 * de a qué velocidad avanzas y la fecha estimada nunca puede mejorar. Se
 * escribe un punto por día local: el `unique (book_id, local_date)` hace que
 * actualizar cinco veces hoy deje solo el último valor, que es justo lo que
 * necesita el cálculo de ritmo (ver src/lib/domain/development/reading.ts).
 *
 * Falla en silencio a propósito: el usuario vino a guardar un libro o a mover
 * la página, y perder un punto del historial no justifica devolverle un error
 * sobre algo que ni sabe que existe.
 *
 * Vive aparte porque lo llaman DOS acciones —el formulario completo y el
 * avance rápido— y duplicarlo garantizaba que un día solo una de las dos
 * alimentara el historial.
 */
async function registrarPunto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  page: number,
  t0: string
): Promise<void> {
  if (page <= 0) return;
  await supabase
    .from("book_progress")
    .upsert({ book_id: bookId, local_date: t0, page }, { onConflict: "book_id,local_date" });
}

/**
 * Avance rápido desde la tarjeta de la Biblioteca, sin abrir el formulario.
 *
 * Existe porque el cálculo de ritmo depende de que alguien lo alimente: si la
 * única forma de registrar una página es abrir "Abrir" y guardar seis campos,
 * `book_progress` se queda casi vacío y `estimatedFinish` contesta siempre "sin
 * datos suficientes". Un input y un botón cambian eso.
 *
 * `updated_at` se toca a propósito: es el desempate del respaldo de focusBook()
 * cuando no hay ningún plan.
 */
export async function updateBookPage(bookId: string, page: number): Promise<ActionResult> {
  if (!Number.isInteger(page) || page < 0) return { ok: false, reason: "La página tiene que ser un número entero." };

  const supabase = await createClient();
  const { data: libro } = await supabase.from("books").select("total_pages").eq("id", bookId).single();
  // Con `total_pages = 0` el libro aún no sabe cuánto mide y no hay tope que
  // imponer; con total conocido, una página más allá del final es un dedazo.
  if (libro && libro.total_pages > 0 && page > libro.total_pages) {
    return { ok: false, reason: `Ese libro tiene ${libro.total_pages} páginas.` };
  }

  const t0 = todayLocal(await getUserTimeZone());
  const { error } = await supabase
    .from("books")
    .update({ current_page: page, updated_at: new Date().toISOString() })
    .eq("id", bookId);
  if (error) return actionFailed(error);

  await registrarPunto(supabase, bookId, page, t0);
  revalidarLectura();
  return actionOk;
}

const planSchema = z.object({
  firstWeek: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una semana válida."),
  weeks: z.coerce.number().int().min(1).max(MAX_PLAN_WEEKS)
});

/**
 * Programar un libro: primera semana + cuántas semanas.
 *
 * El formulario multiplica y la tabla se queda tonta — tres semanas son tres
 * filas (ver el comentario de la migración 0043). `ignoreDuplicates` hace que
 * reprogramar por encima de un plan existente sea idempotente en vez de
 * reventar contra el `unique (book_id, week_start)`: el usuario que amplía de
 * dos a cuatro semanas espera cuatro, no un error.
 */
export async function scheduleBook(bookId: string, formData: FormData): Promise<ActionResult> {
  const parsed = planSchema.safeParse({
    firstWeek: formData.get("firstWeek"),
    weeks: formData.get("weeks")
  });
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "Datos del plan inválidos." };
  }

  // Se normaliza a lunes aquí Y la columna lo exige con un check: la app no es
  // el único camino a la tabla.
  const semanas = planWeeks(weekStartISO(parsed.data.firstWeek), parsed.data.weeks);
  if (!semanas.length) return { ok: false, reason: "Indica al menos una semana." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reading_plan_weeks")
    .upsert(
      semanas.map((week_start, i) => ({ book_id: bookId, week_start, position: i })),
      { onConflict: "book_id,week_start", ignoreDuplicates: true }
    );
  if (error) return actionFailed(error);

  revalidarLectura();
  return actionOk;
}

/** Quita una semana del plan; sin `weekStart`, quita el plan entero del libro. */
export async function unscheduleBook(bookId: string, weekStart?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const query = supabase.from("reading_plan_weeks").delete().eq("book_id", bookId);
  const { error } = await (weekStart ? query.eq("week_start", weekStart) : query);
  if (error) return actionFailed(error);

  revalidarLectura();
  return actionOk;
}

export async function deleteBook(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  // El plan y el historial se van con el libro por `on delete cascade`
  // (migraciones 0034 y 0043): no hay nada que limpiar a mano aquí.
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) return actionFailed(error);
  revalidarLectura();
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
