"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/domain/budget.ts";

const lineSchema = z.object({
  category: z.string().min(1),
  monthlyCost: z.coerce.number().min(0),
  q1Amount: z.coerce.number().min(0),
  q2Amount: z.coerce.number().min(0)
});

/** FR-MNY-018/019: crea o edita un concepto de la pestaña de presupuesto. Reutiliza `budgets` (ADR-...). */
export async function upsertBudgetLine(id: string | null, formData: FormData) {
  const parsed = lineSchema.parse({
    category: formData.get("category"),
    monthlyCost: formData.get("monthlyCost"),
    q1Amount: formData.get("q1Amount"),
    q2Amount: formData.get("q2Amount")
  });
  if (parsed.monthlyCost <= 0) throw new Error("Costo mensual inválido");

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    monthly_cost: round2(parsed.monthlyCost),
    q1_amount: round2(parsed.q1Amount),
    q2_amount: round2(parsed.q2Amount),
    amount: round2(parsed.monthlyCost / 2),
    cycle: "Quincenal"
  };

  if (id) {
    const { error } = await supabase.from("budgets").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("budgets")
      .upsert({ user_id: user.id, period: "current", category: parsed.category, ...payload }, { onConflict: "user_id,period,category" });
    if (error) throw new Error(error.message);
  }

  await supabase.from("audit_log").insert({ user_id: user.id, action: id ? "budget.update" : "budget.create", object: parsed.category });
  revalidatePath("/money/budget");
  revalidatePath("/money");
  revalidatePath("/home");
}

export async function deleteBudgetLine(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/money/budget");
  revalidatePath("/money");
}
