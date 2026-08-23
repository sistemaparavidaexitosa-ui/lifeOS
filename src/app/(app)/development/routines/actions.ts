// src/app/(app)/development/routines/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { nextCompletedSteps, habitLogEffect } from "@/lib/domain/development/routines.ts";

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
