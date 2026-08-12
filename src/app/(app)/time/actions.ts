"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const windowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/)
});

/** FR-TIM-002, BR-017: el fin debe ser posterior al inicio. */
export async function updateActivityWindow(formData: FormData) {
  const parsed = windowSchema.parse({ start: formData.get("start"), end: formData.get("end") });
  if (parsed.end <= parsed.start) throw new Error("El fin debe ser posterior al inicio (BR-017).");

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase
    .from("profiles")
    .update({ activity_window_start: parsed.start, activity_window_end: parsed.end })
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "time.window.update" });
  revalidatePath("/time");
  revalidatePath("/home");
}

const occupationSchema = z.object({
  title: z.string().min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  category: z.enum(["Trabajo", "Familia", "Personal", "Salud", "Descanso", "Otros"]),
  recurring: z.coerce.boolean().default(false)
});

/** FR-TIM-001: crear/editar ocupaciones. */
export async function upsertOccupation(id: string | null, formData: FormData) {
  const parsed = occupationSchema.parse({
    title: formData.get("title"),
    start: formData.get("start"),
    end: formData.get("end"),
    category: formData.get("category"),
    recurring: formData.get("recurring") === "on"
  });
  if (parsed.end <= parsed.start) throw new Error("El fin debe ser posterior al inicio.");

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  if (id) {
    const { error } = await supabase
      .from("occupations")
      .update({ title: parsed.title, start_time: parsed.start, end_time: parsed.end, category: parsed.category, recurring: parsed.recurring })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "occupation.update", object: id });
  } else {
    const { error } = await supabase.from("occupations").insert({
      user_id: user.id,
      title: parsed.title,
      start_time: parsed.start,
      end_time: parsed.end,
      category: parsed.category,
      recurring: parsed.recurring
    });
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "occupation.create" });
  }
  revalidatePath("/time");
  revalidatePath("/home");
}

/** FR-HAB-006, BR-026: eliminar la ocupación NO borra los hábitos ligados (la FK ya usa ON DELETE SET NULL). */
export async function deleteOccupation(id: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("occupations").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "occupation.delete", object: id });
  revalidatePath("/time");
  revalidatePath("/habits");
  revalidatePath("/home");
}

/**
 * FR-TIM-007: asignar una tarea a un espacio disponible. NO crea una
 * ocupación de calendario — solo marca la tarea como impact=true para hoy,
 * consistente con el HTML de referencia.
 */
export async function assignTaskToSlot(taskId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("due").eq("id", taskId).single();
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("tasks").update({ impact: true, due: task?.due ?? today }).eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "time.slot.assign", object: taskId });
  revalidatePath("/time");
  revalidatePath("/home");
}
