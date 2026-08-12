"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/domain/budget.ts";

const goalSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  target: z.coerce.number().min(0),
  current: z.coerce.number().min(0),
  monthly: z.coerce.number().min(0),
  targetDate: z.string().optional().nullable(),
  priority: z.enum(["High", "Medium", "Low"])
});

/** FR-SAV-001/002: crear/editar meta de ahorro. */
export async function upsertSavingsGoal(id: string | null, formData: FormData) {
  const parsed = goalSchema.parse({
    name: formData.get("name"),
    type: formData.get("type"),
    target: formData.get("target"),
    current: formData.get("current"),
    monthly: formData.get("monthly"),
    targetDate: formData.get("targetDate") || null,
    priority: formData.get("priority")
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    name: parsed.name,
    type: parsed.type,
    target: round2(parsed.target),
    current_amount: round2(parsed.current),
    monthly: round2(parsed.monthly),
    target_date: parsed.targetDate,
    priority: parsed.priority
  };

  if (id) {
    const { error } = await supabase.from("savings_goals").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("savings_goals").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/savings");
}

export async function deleteSavingsGoal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("savings_goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/savings");
}

/** FR-SAV-003: aportación periódica con confirmación explícita del usuario. */
export async function contributeToSaving(id: string, amount: number) {
  if (amount <= 0) return;
  const supabase = await createClient();
  const { data: goal } = await supabase.from("savings_goals").select("current_amount").eq("id", id).single();
  if (!goal) throw new Error("Meta no encontrada");

  const { error } = await supabase.from("savings_goals").update({ current_amount: round2(goal.current_amount + amount) }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/savings");
}
