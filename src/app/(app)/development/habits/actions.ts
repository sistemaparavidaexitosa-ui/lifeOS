"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";

const habitSchema = z.object({
  name: z.string().min(1),
  frequency: z.enum(["Diario", "Semanal", "Entre semana", "Fin de semana"]),
  category: z.enum(["Salud", "Aprendizaje", "Trabajo", "Personal", "Otros"]),
  occupationId: z.string().uuid().optional().or(z.literal("")),
  // Los tres campos de «Hábitos atómicos» (migración 0033). Opcionales: un
  // hábito sin señal sigue siendo un hábito válido, solo que más frágil.
  cue: z.string().max(240).optional().default(""),
  twoMinVersion: z.string().max(240).optional().default(""),
  stackAfterHabitId: z.string().uuid().optional().or(z.literal(""))
});

/** FR-HAB-001: crear/editar hábito, opcionalmente ligado a una ocupación. */
export async function upsertHabit(id: string | null, formData: FormData) {
  const parsed = habitSchema.parse({
    name: formData.get("name"),
    frequency: formData.get("frequency"),
    category: formData.get("category"),
    occupationId: formData.get("occupationId") ?? "",
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
    frequency: parsed.frequency,
    category: parsed.category,
    occupation_id: parsed.occupationId || null,
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
  revalidatePath("/development/habits");
  revalidatePath("/home");
}

export async function deleteHabit(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("habits").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/habits");
}

/** FR-HAB-002: marca/desmarca el cumplimiento de hoy (toggle idempotente). */
export async function toggleHabitToday(habitId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const t0 = todayLocal(await getUserTimeZone());
  const { data: existing } = await supabase.from("habit_logs").select("id").eq("habit_id", habitId).eq("log_date", t0).maybeSingle();

  if (existing) {
    await supabase.from("habit_logs").delete().eq("id", existing.id);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.uncomplete", object: habitId });
  } else {
    await supabase.from("habit_logs").insert({ habit_id: habitId, log_date: t0 });
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.complete", object: habitId });
  }
  revalidatePath("/development/habits");
  revalidatePath("/home");
}
