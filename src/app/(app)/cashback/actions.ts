"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/domain/budget.ts";

const cardSchema = z.object({
  name: z.string().min(1),
  ratePct: z.coerce.number().min(0),
  debtId: z.string().uuid().optional().or(z.literal("")),
  accruedEstimate: z.coerce.number().min(0),
  eligibleCategories: z.array(z.string())
});

/** FR-DEB-007, NG-012: cashback informativo, no requiere integración bancaria en tiempo real. */
export async function upsertCashbackCard(id: string | null, formData: FormData) {
  const parsed = cardSchema.parse({
    name: formData.get("name"),
    ratePct: formData.get("ratePct"),
    debtId: formData.get("debtId") ?? "",
    accruedEstimate: formData.get("accruedEstimate"),
    eligibleCategories: formData.getAll("eligibleCategories")
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    name: parsed.name,
    rate_pct: parsed.ratePct,
    debt_id: parsed.debtId || null,
    accrued_estimate: round2(parsed.accruedEstimate),
    eligible_categories: parsed.eligibleCategories
  };

  if (id) {
    const { error } = await supabase.from("cashback_cards").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "cashback.update", object: id });
  } else {
    const { error } = await supabase.from("cashback_cards").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "cashback.create" });
  }
  revalidatePath("/cashback");
}

export async function deleteCashbackCard(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cashback_cards").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/cashback");
}

/** BR-025: redención manual, nunca automática. */
export async function redeemCashback(cardId: string, amount: number) {
  if (amount <= 0) return;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("cashback_redemptions").insert({ card_id: cardId, amount: round2(amount) });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "cashback.redeem", object: cardId, meta: { amount } });
  revalidatePath("/cashback");
}
