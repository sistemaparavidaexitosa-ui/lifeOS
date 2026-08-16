"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/domain/budget.ts";

const accountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["bank", "cash", "savings", "credit", "investment"]),
  currency: z.string().min(1),
  opening: z.coerce.number().default(0)
});

export async function createAccount(formData: FormData) {
  const parsed = accountSchema.parse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    opening: formData.get("opening") ?? 0
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("accounts").insert({
    user_id: user.id,
    name: parsed.name,
    type: parsed.type,
    currency: parsed.currency,
    opening_balance: round2(parsed.opening)
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "account.create" });
  revalidatePath("/money");
}

const txnSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.coerce.number().positive("Monto inválido"),
  memo: z.string().min(1, "Concepto requerido"),
  accountId: z.string().uuid(),
  accountToId: z.string().uuid().optional().or(z.literal("")),
  category: z.string().optional().default("Otros"),
  effectiveAt: z.string().optional(),
  familyMemberId: z.string().uuid().optional().or(z.literal("")),
  debtId: z.string().uuid().optional().or(z.literal(""))
});

/**
 * FR-MNY-002/003, BR-001/002/009: asiento balanceado. FR-DEB-006, BR-024: si
 * se vincula una deuda, reduce SOLO su saldo (reutiliza el ledger — ADR-016,
 * ninguna tabla de pagos paralela).
 */
export async function postTransaction(formData: FormData) {
  const parsed = txnSchema.parse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    memo: formData.get("memo"),
    accountId: formData.get("accountId"),
    accountToId: formData.get("accountToId") ?? "",
    category: formData.get("category") ?? "Otros",
    effectiveAt: formData.get("effectiveAt") || undefined,
    familyMemberId: formData.get("familyMemberId") ?? "",
    debtId: formData.get("debtId") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const effectiveAt = parsed.effectiveAt ?? new Date().toISOString().slice(0, 10);
  const amountMinor = round2(parsed.amount);
  const dedupeKey = `${parsed.memo}|${effectiveAt}|${amountMinor}`;
  const debtId = parsed.type === "expense" && parsed.debtId ? parsed.debtId : null;

  const { data: dup } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("user_id", user.id)
    .eq("dedupe_key", dedupeKey)
    .neq("status", "Reversed")
    .limit(1);
  const status = dup && dup.length ? "Posted" : "Posted"; // BR-009: se marca "posible duplicado" en la UI, no bloquea

  const { data: entry, error: entryErr } = await supabase
    .from("journal_entries")
    .insert({
      user_id: user.id,
      type: parsed.type,
      memo: parsed.memo,
      entry_date: effectiveAt,
      effective_at: effectiveAt,
      category: parsed.type === "transfer" ? "Ahorro" : parsed.category,
      status,
      dedupe_key: dedupeKey,
      family_member_id: parsed.familyMemberId || null,
      debt_id: debtId
    })
    .select()
    .single();
  if (entryErr || !entry) throw new Error(entryErr?.message ?? "No se pudo crear el asiento");

  let lines: { entry_id: string; account_id: string; amount: number }[];
  if (parsed.type === "income") {
    lines = [{ entry_id: entry.id, account_id: parsed.accountId, amount: amountMinor }];
  } else if (parsed.type === "expense") {
    lines = [{ entry_id: entry.id, account_id: parsed.accountId, amount: -amountMinor }];
  } else {
    if (!parsed.accountToId || parsed.accountToId === parsed.accountId) throw new Error("Selecciona cuentas distintas");
    lines = [
      { entry_id: entry.id, account_id: parsed.accountId, amount: -amountMinor },
      { entry_id: entry.id, account_id: parsed.accountToId, amount: amountMinor }
    ];
  }
  const { error: linesErr } = await supabase.from("journal_lines").insert(lines);
  if (linesErr) throw new Error(linesErr.message);

  if (debtId) {
    const { data: debt } = await supabase.from("debts").select("balance").eq("id", debtId).single();
    if (debt) {
      await supabase.from("debts").update({ balance: round2(Math.max(0, debt.balance - amountMinor)) }).eq("id", debtId);
    }
  }

  await supabase.from("audit_log").insert({ user_id: user.id, action: "txn.post", object: entry.id, meta: { debtId, familyMemberId: parsed.familyMemberId || null } });
  revalidatePath("/money");
  revalidatePath("/money/budget");
  revalidatePath("/debt");
  revalidatePath("/home");
}

export async function reconcileEntry(entryId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("journal_entries").update({ status: "Reconciled", reconciled: true }).eq("id", entryId);
  if (error) throw new Error(error.message);
  revalidatePath("/money");
  revalidatePath("/money/budget");
}

/** BR: un movimiento publicado no se elimina, se reversa con un asiento inverso. */
export async function reverseEntry(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: entry } = await supabase.from("journal_entries").select("*, journal_lines(*)").eq("id", entryId).single();
  if (!entry) throw new Error("Movimiento no encontrado");

  if (entry.debt_id) {
    const amt = Math.abs((entry.journal_lines ?? []).reduce((s: number, l: { amount: number }) => s + l.amount, 0));
    const { data: debt } = await supabase.from("debts").select("balance").eq("id", entry.debt_id).single();
    if (debt) await supabase.from("debts").update({ balance: round2(debt.balance + amt) }).eq("id", entry.debt_id);
  }

  await supabase.from("journal_entries").update({ status: "Reversed" }).eq("id", entryId);

  const { data: reversal } = await supabase
    .from("journal_entries")
    .insert({
      user_id: user.id,
      type: entry.type,
      memo: `Reversión: ${entry.memo}`,
      entry_date: new Date().toISOString().slice(0, 10),
      effective_at: new Date().toISOString().slice(0, 10),
      category: entry.category,
      status: "Posted",
      dedupe_key: `reversal-${entryId}-${Date.now()}`,
      family_member_id: entry.family_member_id
    })
    .select()
    .single();
  if (reversal) {
    await supabase.from("journal_lines").insert((entry.journal_lines ?? []).map((l: { account_id: string; amount: number }) => ({ entry_id: reversal.id, account_id: l.account_id, amount: -l.amount })));
  }

  await supabase.from("audit_log").insert({ user_id: user.id, action: "txn.reverse", object: entryId });
  revalidatePath("/money");
  revalidatePath("/debt");
}
