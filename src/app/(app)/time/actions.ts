"use server";

// Autogestión del Tiempo — Server Actions.
//
// ACTUALIZACIÓN (soporte de ocupaciones/tareas por día específico,
// FR-TIM-001/003/007/008): antes de este cambio, una ocupación NO
// recurrente no tenía ninguna fecha asociada — la vista semanal repetía el
// mismo conjunto de ocupaciones en los 7 días. Ahora:
//   - upsertOccupation acepta `date` (obligatoria si recurring=false, se
//     ignora si recurring=true) y la persiste en la nueva columna
//     occ_date (migración 0016_time_occupation_date.sql).
//   - assignTaskToDate reemplaza la lógica interna de assignTaskToSlot,
//     generalizada para CUALQUIER fecha, no solo "hoy". assignTaskToSlot
//     se conserva como wrapper de compatibilidad (día actual) para no
//     romper nada que ya lo use.
//   - unassignTaskDue: nueva acción para "quitar" una tarea de un día (le
//     limpia due e impact), necesaria para poder editar la asignación de
//     tareas de cualquier día desde la vista semanal.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";

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

const occupationSchema = z
  .object({
    title: z.string().min(1),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    category: z.enum(["Trabajo", "Familia", "Personal", "Salud", "Descanso", "Otros"]),
    recurring: z.coerce.boolean().default(false),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal(""))
  })
  // FR-TIM-001/008: una ocupación NO recurrente debe declarar a qué día
  // pertenece; una recurrente ignora la fecha (se muestra en los 7 días).
  .refine((v) => v.recurring || (!!v.date && v.date.length > 0), {
    message: "Selecciona el día para una ocupación no recurrente.",
    path: ["date"]
  });

/**
 * FR-TIM-001: crear/editar ocupaciones, ahora para CUALQUIER día de la
 * semana (no solo "hoy"). `date` se persiste en occ_date cuando
 * recurring=false; se guarda null cuando recurring=true.
 */
export async function upsertOccupation(id: string | null, formData: FormData) {
  const parsed = occupationSchema.parse({
    title: formData.get("title"),
    start: formData.get("start"),
    end: formData.get("end"),
    category: formData.get("category"),
    recurring: formData.get("recurring") === "on",
    date: formData.get("date") ?? ""
  });
  if (parsed.end <= parsed.start) throw new Error("El fin debe ser posterior al inicio.");

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    title: parsed.title,
    start_time: parsed.start,
    end_time: parsed.end,
    category: parsed.category,
    recurring: parsed.recurring,
    occ_date: parsed.recurring ? null : parsed.date || null
  };

  if (id) {
    const { error } = await supabase.from("occupations").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "occupation.update", object: id, meta: { date: payload.occ_date } });
  } else {
    const { error } = await supabase.from("occupations").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "occupation.create", meta: { date: payload.occ_date } });
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
  revalidatePath("/development/habits");
  revalidatePath("/home");
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * FR-TIM-007 (generalizada a cualquier día): asigna una tarea existente a
 * un espacio disponible de un día concreto. NO crea una ocupación de
 * calendario. Solo marca impact=true cuando el día asignado es HOY
 * (BR-018: "impact" es un concepto de la planeación del día en curso,
 * FR-PLN-002); para cualquier otro día, solo se reprograma `due` sin tocar
 * impact, ya que marcar impacto en un día futuro no corresponde al
 * concepto de "Única Cosa"/tareas de impacto del día en curso.
 */
export async function assignTaskToDate(taskId: string, date: string) {
  const parsedDate = isoDate.parse(date);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const isToday = parsedDate === todayLocal(await getUserTimeZone());
  const { error } = await supabase
    .from("tasks")
    .update(isToday ? { impact: true, due: parsedDate } : { due: parsedDate })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "time.slot.assign", object: taskId, meta: { date: parsedDate } });
  revalidatePath("/time");
  revalidatePath("/home");
}

/** Wrapper de compatibilidad: asigna al día de HOY (mismo contrato que antes de esta actualización). */
export async function assignTaskToSlot(taskId: string) {
  return assignTaskToDate(taskId, todayLocal(await getUserTimeZone()));
}

/**
 * Permite "editar" (quitar) la asignación de una tarea a un día concreto —
 * cierra el requisito de poder editar tareas de cualquier día desde la
 * vista semanal. Limpia due e impact; no cambia el status de la tarea.
 */
export async function unassignTaskDue(taskId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("tasks").update({ due: null, impact: false }).eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "time.slot.unassign", object: taskId });
  revalidatePath("/time");
  revalidatePath("/home");
}
