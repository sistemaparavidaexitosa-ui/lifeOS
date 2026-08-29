// src/app/(app)/development/routines/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { nextCompletedSteps, habitLogEffect } from "@/lib/domain/development/routines.ts";
import { getRoutineTemplate, matchHabitForStep } from "@/lib/domain/development/templates.ts";
import { describeDbError, type ActionResult } from "@/lib/supabase/errors";

const routineSchema = z.object({
  name: z.string().min(1),
  frequency: z.enum(["Diario", "Semanal", "Entre semana", "Fin de semana"]),
  occupationId: z.string().uuid().optional().or(z.literal("")),
  active: z.coerce.boolean().default(true)
});

export async function upsertRoutine(id: string | null, formData: FormData) {
  const parsed = routineSchema.parse({
    name: formData.get("name"),
    frequency: formData.get("frequency"),
    occupationId: formData.get("occupationId") ?? "",
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

const stepSchema = z.object({
  title: z.string().min(1),
  durationMin: z.coerce.number().int().min(1).default(5),
  habitId: z.string().uuid().optional().or(z.literal("")),
  position: z.coerce.number().int().min(0).default(0)
});

export async function upsertRoutineStep(routineId: string, id: string | null, formData: FormData) {
  const parsed = stepSchema.parse({
    title: formData.get("title"),
    durationMin: formData.get("durationMin") ?? 5,
    habitId: formData.get("habitId") ?? "",
    position: formData.get("position") ?? 0
  });

  const supabase = await createClient();
  const payload = {
    title: parsed.title,
    duration_min: parsed.durationMin,
    habit_id: parsed.habitId || null,
    position: parsed.position
  };

  if (id) {
    const { error } = await supabase.from("routine_steps").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("routine_steps").insert({ ...payload, routine_id: routineId });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/development/routines");
  revalidatePath("/development");
}

export async function deleteRoutineStep(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("routine_steps").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/routines");
  revalidatePath("/development");
}

/**
 * Marca/desmarca un paso de la ejecución de HOY. Cuando el paso está ligado a
 * un hábito, la decisión de tocar `habit_logs` la toma `habitLogEffect` —
 * función pura y probada— y esta acción solo la ejecuta.
 */
export async function toggleRoutineStep(routineId: string, stepId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const today = todayLocal(await getUserTimeZone());

  const [{ data: run }, { data: step }, { data: steps }] = await Promise.all([
    supabase.from("routine_runs").select("id, completed_step_ids").eq("routine_id", routineId).eq("local_date", today).maybeSingle(),
    supabase.from("routine_steps").select("habit_id").eq("id", stepId).single(),
    supabase.from("routine_steps").select("id").eq("routine_id", routineId)
  ]);

  const current = run?.completed_step_ids ?? [];
  const next = nextCompletedSteps(current, stepId);
  const willBeDone = next.includes(stepId);
  const allDone = (steps ?? []).length > 0 && next.length >= (steps ?? []).length;

  // upsert con onConflict: dos clics simultáneos no crean dos ejecuciones del
  // mismo día — el índice único (routine_id, local_date) lo resuelve en la base.
  const { error } = await supabase
    .from("routine_runs")
    .upsert(
      { routine_id: routineId, local_date: today, completed_step_ids: next, completed_at: allDone ? new Date().toISOString() : null },
      { onConflict: "routine_id,local_date" }
    );
  if (error) throw new Error(error.message);

  const habitId = step?.habit_id ?? null;
  if (habitId) {
    const { data: log } = await supabase.from("habit_logs").select("id").eq("habit_id", habitId).eq("log_date", today).maybeSingle();
    if (habitLogEffect(habitId, willBeDone, Boolean(log)) === "insert") {
      await supabase.from("habit_logs").insert({ habit_id: habitId, log_date: today });
      await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.complete", object: habitId });
    }
  }

  revalidatePath("/development/routines");
  revalidatePath("/development/habits");
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
 *   - Si un paso corresponde a un hábito que el usuario ya lleva, se liga por
 *     `routine_steps.habit_id` en vez de duplicarlo. La migración 0024 lo dice:
 *     así la racha no se bifurca.
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
      active: true
    })
    .select("id")
    .single();
  if (error || !routine) return { ok: false, reason: describeDbError(error) };

  // Los hábitos del usuario, para intentar ligar los pasos que correspondan.
  const { data: habits } = await supabase.from("habits").select("id, name");

  const steps = template.steps.map((step, index) => ({
    routine_id: routine.id,
    title: step.title,
    duration_min: step.durationMin,
    position: index,
    habit_id: matchHabitForStep(step.habitHint, habits ?? [])
  }));

  const { error: stepsError } = await supabase.from("routine_steps").insert(steps);
  if (stepsError) {
    // Una rutina sin pasos no sirve de nada y es peor que no haberla creado:
    // el usuario tendría que borrarla a mano para volver a intentarlo.
    await supabase.from("routines").delete().eq("id", routine.id);
    return { ok: false, reason: describeDbError(stepsError) };
  }

  revalidatePath("/development/routines");
  revalidatePath("/development");
  return { ok: true, id: routine.id as string };
}
