"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/domain/budget.ts";

const goalSchema = z.object({
  name: z.string().min(1),
  target: z.coerce.number().min(0),
  current: z.coerce.number().min(0),
  horizon: z.string().optional().nullable(),
  priority: z.enum(["High", "Medium", "Low"]),
  accountIds: z.array(z.string().uuid()),
  familyMemberId: z.string().uuid().optional().or(z.literal(""))
});

/** FR-GOL-001/002/004: escenario sujeto a supuestos (BR-010), asociable a un dependiente económico. */
export async function upsertFinancialGoal(id: string | null, formData: FormData) {
  const parsed = goalSchema.parse({
    name: formData.get("name"),
    target: formData.get("target"),
    current: formData.get("current"),
    horizon: formData.get("horizon") || null,
    priority: formData.get("priority"),
    accountIds: formData.getAll("accountIds"),
    familyMemberId: formData.get("familyMemberId") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    name: parsed.name,
    target: round2(parsed.target),
    current_amount: round2(parsed.current),
    horizon: parsed.horizon,
    priority: parsed.priority,
    account_ids: parsed.accountIds,
    family_member_id: parsed.familyMemberId || null
  };

  if (id) {
    const { error } = await supabase.from("financial_goals").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("financial_goals").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/goals");
}

export async function deleteFinancialGoal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("financial_goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/goals");
}
