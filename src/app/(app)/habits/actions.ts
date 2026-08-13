"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";

const habitSchema = z.object({
  name: z.string().min(1),
  frequency: z.enum(["Diario", "Semanal", "Entre semana", "Fin de semana"]),
  category: z.enum(["Salud", "Aprendizaje", "Trabajo", "Personal", "Otros"]),
  occupationId: z.string().uuid().optional().or(z.literal(""))
});

/** FR-HAB-001: crear/editar hábito, opcionalmente ligado a una ocupación. */
export async function upsertHabit(id: string | null, formData: FormData) {
  const parsed = habitSchema.parse({
    name: formData.get("name"),
    frequency: formData.get("frequency"),
    category: formData.get("category"),
    occupationId: formData.get("occupationId") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = { name: parsed.name, frequency: parsed.frequency, category: parsed.category, occupation_id: parsed.occupationId || null };

  if (id) {
    const { error } = await supabase.from("habits").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("habits").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/habits");
  revalidatePath("/home");
}

export async function deleteHabit(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("habits").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/habits");
}

/** FR-HAB-002: marca/desmarca el cumplimiento de hoy (toggle idempotente). */
export async function toggleHabitToday(habitId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const t0 = todayLocal();
  const { data: existing } = await supabase.from("habit_logs").select("id").eq("habit_id", habitId).eq("log_date", t0).maybeSingle();

  if (existing) {
    await supabase.from("habit_logs").delete().eq("id", existing.id);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.uncomplete", object: habitId });
  } else {
    await supabase.from("habit_logs").insert({ habit_id: habitId, log_date: t0 });
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.complete", object: habitId });
  }
  revalidatePath("/habits");
  revalidatePath("/home");
}

const bookSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional().default(""),
  status: z.enum(["Por leer", "Leyendo", "Terminado"]),
  currentPage: z.coerce.number().int().min(0).default(0),
  totalPages: z.coerce.number().int().min(0).default(0)
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
    totalPages: formData.get("totalPages") ?? 0
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const t0 = todayLocal();
  const payload: BookUpsertPayload = {
    title: parsed.title,
    author: parsed.author,
    status: parsed.status,
    current_page: parsed.currentPage,
    total_pages: parsed.totalPages,
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
  revalidatePath("/habits");
  revalidatePath("/home");
}

export async function deleteBook(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/habits");
  revalidatePath("/home");
}

/** FR-HAB-004: agregar una nota de lectura asociada a una página. */
export async function addBookNote(bookId: string, pageRef: number, text: string) {
  if (!text.trim()) return;
  const supabase = await createClient();
  const { error } = await supabase.from("book_notes").insert({ book_id: bookId, page_ref: pageRef, text: text.trim() });
  if (error) throw new Error(error.message);
  revalidatePath("/habits");
}
