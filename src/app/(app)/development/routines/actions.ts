// src/app/(app)/development/routines/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { toggleHabitEffect, routineRunComplete } from "@/lib/domain/development/routines.ts";
import { getRoutineTemplate, matchHabitForStep } from "@/lib/domain/development/templates.ts";
import { describeDbError, type ActionResult } from "@/lib/supabase/errors";

const routineSchema = z.object({
  name: z.string().min(1),
  frequency: z.enum(["Diario", "Semanal", "Entre semana", "Fin de semana"]),
  occupationId: z.string().uuid().optional().or(z.literal("")),
  // Cap. 2 de «Hábitos atómicos»: opcional, porque una rutina sin identidad
  // sigue siendo una rutina — solo que sostenida por fuerza de voluntad.
  identity: z.string().max(160).optional().default(""),
  active: z.coerce.boolean().default(true)
});

export async function upsertRoutine(id: string | null, formData: FormData) {
  const parsed = routineSchema.parse({
    name: formData.get("name"),
    frequency: formData.get("frequency"),
    occupationId: formData.get("occupationId") ?? "",
    identity: formData.get("identity") ?? "",
    active: formData.get("active") === "on" || formData.get("active") === "true"
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    name: parsed.name,
    frequency: parsed.frequency,
    occupation_id: parsed.occupationId || null,
    identity: parsed.identity.trim(),
    active: parsed.active
  };

  if (id) {
    const { error } = await supabase.from("routines").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("routines").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/development/routines");
  revalidatePath("/development");
}

export async function deleteRoutine(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("routines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/routines");
  revalidatePath("/development");
}

const habitSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["Salud", "Aprendizaje", "Trabajo", "Personal", "Otros"]),
  durationMin: z.coerce.number().int().min(1).default(5),
  position: z.coerce.number().int().min(0).default(0),
  // Los tres campos de «Hábitos atómicos» (migración 0033). Opcionales: un
  // hábito sin señal sigue siendo un hábito válido, solo que más frágil.
  cue: z.string().max(240).optional().default(""),
  twoMinVersion: z.string().max(240).optional().default(""),
  stackAfterHabitId: z.string().uuid().optional().or(z.literal(""))
});

/**
 * Crear o editar un hábito. `routineId` es un parámetro y no un campo del
 * formulario porque desde 0045 no hay hábito sin rutina: el formulario se abre
 * siempre desde dentro de una, y no hay estado en el que la pregunta «¿de qué
 * rutina?» quede abierta.
 *
 * Ya no recibe `frequency` —la dicta la rutina— ni `occupationId` —el bloque lo
 * ancla la rutina—. Las dos columnas se fueron en 0045.
 */
export async function upsertHabit(routineId: string, id: string | null, formData: FormData) {
  const parsed = habitSchema.parse({
    name: formData.get("name"),
    category: formData.get("category"),
    durationMin: formData.get("durationMin") ?? 5,
    position: formData.get("position") ?? 0,
    cue: formData.get("cue") ?? "",
    twoMinVersion: formData.get("twoMinVersion") ?? "",
    stackAfterHabitId: formData.get("stackAfterHabitId") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    name: parsed.name,
    category: parsed.category,
    routine_id: routineId,
    position: parsed.position,
    duration_min: parsed.durationMin,
    cue: parsed.cue.trim(),
    two_min_version: parsed.twoMinVersion.trim(),
    stack_after_habit_id: parsed.stackAfterHabitId || null
  };

  if (id) {
    const { error } = await supabase.from("habits").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("habits").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
}

export async function deleteHabit(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("habits").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
}

/**
 * Marca o desmarca el hábito de hoy, y de paso abre o cierra la ejecución de su
 * rutina.
 *
 * Un solo registro: `habit_logs`. Antes de 0045 había dos —el paso en
 * `routine_runs.completed_step_ids` y el hábito en `habit_logs`— y esta acción
 * tenía que reconciliarlos. Ahora `routine_runs` solo guarda CUÁNDO se cerró la
 * rutina, y quién decide si está cerrada es `routineRunComplete`.
 */
export async function toggleHabitToday(routineId: string, habitId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const today = todayLocal(await getUserTimeZone());

  const [{ data: log }, { data: habits }] = await Promise.all([
    supabase.from("habit_logs").select("id").eq("habit_id", habitId).eq("log_date", today).maybeSingle(),
    supabase.from("habits").select("id").eq("routine_id", routineId)
  ]);

  if (toggleHabitEffect(Boolean(log)) === "delete") {
    const { error } = await supabase.from("habit_logs").delete().eq("id", log!.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.uncomplete", object: habitId });
  } else {
    const { error } = await supabase.from("habit_logs").insert({ habit_id: habitId, log_date: today });
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.complete", object: habitId });
  }

  // Se relee el día DESPUÉS de escribir: así el cierre de la rutina refleja el
  // estado real y no el que teníamos antes del clic.
  const habitIds = (habits ?? []).map((h) => h.id);
  const { data: logsHoy } = await supabase
    .from("habit_logs")
    .select("habit_id")
    .eq("log_date", today)
    .in("habit_id", habitIds.length > 0 ? habitIds : ["00000000-0000-0000-0000-000000000000"]);

  const cerrada = routineRunComplete(habitIds, (logsHoy ?? []).map((l) => l.habit_id));

  // upsert con onConflict: dos clics simultáneos no crean dos ejecuciones del
  // mismo día — el índice único (routine_id, local_date) lo resuelve en la base.
  // `started_at` no viaja en el payload, así que la primera hora se conserva.
  const { error } = await supabase
    .from("routine_runs")
    .upsert(
      { routine_id: routineId, local_date: today, completed_at: cerrada ? new Date().toISOString() : null },
      { onConflict: "routine_id,local_date" }
    );
  if (error) throw new Error(error.message);

  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
}

/**
 * Crea una rutina COPIANDO una plantilla del catálogo.
 *
 * Copia y no enlace: a partir de aquí la rutina es del usuario y se edita como
 * cualquier otra. Cambiar el catálogo en un despliegue futuro no puede
 * reescribirle los pasos a nadie.
 *
 * Dos cosas que aprovechan lo que ya existe:
 *
 *   - `occupationId` se pide al crear. Tanto Mañana Milagrosa como el Club de
 *     las 5 AM tratan de UNA HORA concreta del día; anclarla al bloque horario
 *     en el momento de crear la rutina es la mitad del método, y después nadie
 *     vuelve a abrir el formulario para hacerlo.
 *   - La plantilla siembra HÁBITOS, no pasos: desde 0045 son lo mismo, así que
 *     cada paso de la plantilla nace con racha propia desde el primer día.
 *     `matchHabitForStep` ya no sirve para ligar —no hay nada que ligar— pero
 *     sí para NO duplicar: si el usuario ya tiene ese hábito en otra rutina, se
 *     salta, porque un hábito solo puede estar en una.
 *
 * Contrato `{ ok, reason }` (D-030): esta acción la llama un Client Component
 * que necesita pintar el motivo si algo falla.
 */
export async function createRoutineFromTemplate(templateId: string, occupationId: string): Promise<ActionResult & { id?: string }> {
  const template = getRoutineTemplate(templateId);
  if (!template) return { ok: false, reason: "Esa plantilla ya no existe." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: routine, error } = await supabase
    .from("routines")
    .insert({
      user_id: user.id,
      name: template.name,
      frequency: template.frequency,
      occupation_id: occupationId || null,
      identity: "",
      active: true
    })
    .select("id")
    .single();
  if (error || !routine) return { ok: false, reason: describeDbError(error) };

  // Los hábitos que el usuario ya tiene, para no sembrar un duplicado que
  // bifurcaría la racha en dos filas con el mismo nombre.
  const { data: existentes } = await supabase.from("habits").select("id, name");

  const nuevos = template.steps
    .filter((step) => matchHabitForStep(step.habitHint ?? step.title, existentes ?? []) === null)
    .map((step, index) => ({
      user_id: user.id,
      routine_id: routine.id,
      name: step.title,
      category: "Otros" as const,
      position: index,
      duration_min: step.durationMin,
      cue: "",
      two_min_version: ""
    }));

  if (nuevos.length > 0) {
    const { error: habitsError } = await supabase.from("habits").insert(nuevos);
    if (habitsError) {
      // Una rutina sin hábitos no sirve de nada y es peor que no haberla creado:
      // el usuario tendría que borrarla a mano para volver a intentarlo.
      await supabase.from("routines").delete().eq("id", routine.id);
      return { ok: false, reason: describeDbError(habitsError) };
    }
  }

  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
  return { ok: true, id: routine.id as string };
}
