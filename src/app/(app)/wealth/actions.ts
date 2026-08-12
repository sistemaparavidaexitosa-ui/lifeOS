"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/domain/budget.ts";
import { accountBalance, netWorth } from "@/lib/domain/money.ts";

const assetSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  value: z.coerce.number().min(0),
  asOf: z.string(),
  source: z.string().min(1)
});

export async function upsertAsset(id: string | null, formData: FormData) {
  const parsed = assetSchema.parse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    value: formData.get("value"),
    asOf: formData.get("asOf"),
    source: formData.get("source")
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = { name: parsed.name, kind: parsed.kind, value: round2(parsed.value), as_of: parsed.asOf, source: parsed.source };
  if (id) {
    const { error } = await supabase.from("assets").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("assets").insert({ ...payload, user_id: user.id, currency: "MXN" });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/wealth");
}

export async function deleteAsset(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/wealth");
}

/** FR-WLT-002, BR-004: snapshot inmutable — nunca se edita destructivamente, se genera uno nuevo. */
export async function createNetWorthSnapshot() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const [{ data: accounts }, { data: entries }, { data: investments }, { data: assets }, { data: debts }, { data: liabilities }] = await Promise.all([
    supabase.from("accounts").select("id, opening_balance"),
    supabase.from("journal_entries").select("*, journal_lines(*)"),
    supabase.from("investments").select("valuation"),
    supabase.from("assets").select("value"),
    supabase.from("debts").select("balance"),
    supabase.from("liabilities").select("value")
  ]);

  const entriesForDomain = (entries ?? []).map((e) => ({
    id: e.id,
    type: e.type as "income" | "expense" | "transfer",
    date: e.entry_date,
    category: e.category,
    status: e.status as "Posted" | "Reconciled" | "Reversed",
    lines: (e.journal_lines ?? []).map((l: { account_id: string; amount: number }) => ({ account: l.account_id, amount: l.amount }))
  }));
  const liquidity = (accounts ?? []).reduce((s, a) => s + accountBalance(a.id, a.opening_balance, entriesForDomain), 0);
  const totalAssets = liquidity + (investments ?? []).reduce((s, i) => s + i.valuation, 0) + (assets ?? []).reduce((s, a) => s + a.value, 0);
  const totalLiabilities = (debts ?? []).reduce((s, d) => s + d.balance, 0) + (liabilities ?? []).reduce((s, l) => s + l.value, 0);
  const net = netWorth(totalAssets, totalLiabilities);

  const { error } = await supabase.from("net_worth_snapshots").insert({
    user_id: user.id,
    assets: round2(totalAssets),
    liabilities: round2(totalLiabilities),
    net
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "networth.snapshot" });
  revalidatePath("/wealth");
}
