"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const debtSchema = z.object({
  name: z.string().min(1),
  balance: z.coerce.number().min(0),
  rate: z.coerce.number().min(0),
  minPayment: z.coerce.number().min(0),
  dueDay: z.coerce.number().int().min(1).max(28)
});

export async function upsertDebt(id: string | null, formData: FormData) {
  const parsed = debtSchema.parse({
    name: formData.get("name"),
    balance: formData.get("balance"),
    rate: formData.get("rate"),
    minPayment: formData.get("minPayment"),
    dueDay: formData.get("dueDay")
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = { name: parsed.name, balance: parsed.balance, rate: parsed.rate, min_payment: parsed.minPayment, due_day: parsed.dueDay };

  if (id) {
    const { error } = await supabase.from("debts").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("debts").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/debt");
}

export async function deleteDebt(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("debts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/debt");
}

/** FR-DEB-008: guarda el escenario editado (deuda, meses, monto) para consulta posterior. No ejecuta pagos (NG-003). */
export async function saveDebtScenario(debtId: string, monthlyAmount: number) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  await supabase.from("audit_log").insert({ user_id: user.id, action: "debt.simulate.save", object: debtId, meta: { monthlyAmount } });
}

/** FR-DEB-005: registra la aceptación auditada de un plan "IA Optimizada" sin ejecutar pagos. */
export async function acceptAiDebtPlan(chosen: string, extra: number) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  await supabase.from("audit_log").insert({ user_id: user.id, action: "debt.ai.plan", meta: { chosen, extra } });
}
