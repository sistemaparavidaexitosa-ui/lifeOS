"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/domain/budget.ts";

const lineSchema = z.object({
  category: z.string().min(1, "Escribe el nombre del concepto"),
  monthlyCost: z.coerce.number().min(0),
  q1Amount: z.coerce.number().min(0),
  q2Amount: z.coerce.number().min(0)
});

/**
 * FR-MNY-018/019: crea o edita un concepto de la pestaña de presupuesto.
 * Reutiliza `budgets` (ADR-...).
 *
 * Diseño (16-ago-2026, decisión explícita del owner): las categorías de
 * gasto NO se gestionan desde Configuración. El nombre del concepto se
 * escribe aquí mismo, al crear el presupuesto; si esa categoría no existe
 * todavía en `public.categories`, se crea automáticamente (upsert
 * idempotente vía el índice único `categories(user_id, name)`, ver
 * 0005_money_ledger_budget.sql). Esto la deja disponible de inmediato para
 * categorizar movimientos en Dashboard y Gastos (FR-MNY-005), sin
 * necesidad de un paso previo en Configuración.
 */
export async function upsertBudgetLine(id: string | null, formData: FormData) {
  const parsed = lineSchema.parse({
    category: formData.get("category"),
    monthlyCost: formData.get("monthlyCost"),
    q1Amount: formData.get("q1Amount"),
    q2Amount: formData.get("q2Amount")
  });
  if (parsed.monthlyCost <= 0) throw new Error("Costo mensual inválido");

  const category = parsed.category.trim();
  if (!category) throw new Error("Escribe el nombre del concepto");

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
    // Evita sobrescribir en silencio un concepto ya existente para la misma
    // categoría (el upsert de abajo usa onConflict user_id,period,category,
    // que de otro modo actualizaría esa fila en vez de avisar al usuario).
    const { data: existingLine } = await supabase
      .from("budgets")
      .select("id")
      .eq("user_id", user.id)
      .eq("period", "current")
      .eq("category", category)
      .maybeSingle();
    if (existingLine) {
      throw new Error(`Ya existe un concepto para "${category}". Edítalo directamente desde la lista.`);
    }

    // Único punto de entrada para categorías nuevas: se crea aquí, no en
    // Configuración. ignoreDuplicates hace esto un no-op seguro si la
    // categoría ya existía (p. ej. reutilizada de un concepto anterior).
    const { error: catError } = await supabase
      .from("categories")
      .upsert({ user_id: user.id, name: category }, { onConflict: "user_id,name", ignoreDuplicates: true });
    if (catError) throw new Error(catError.message);

    const { error } = await supabase
      .from("budgets")
      .upsert({ user_id: user.id, period: "current", category, ...payload }, { onConflict: "user_id,period,category" });
    if (error) throw new Error(error.message);
  }

  await supabase.from("audit_log").insert({ user_id: user.id, action: id ? "budget.update" : "budget.create", object: category });
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

const incomeSchema = z.object({
  quincenalIncome: z.coerce.number().min(0, "El ingreso quincenal no puede ser negativo")
});

/**
 * Extensión Presupuesto: guarda el ingreso quincenal declarado por el
 * usuario (profiles.quincenal_income). Se usa en budget/page.tsx para
 * calcular la diferencia si las aportaciones Q1/Q2 exceden ese ingreso.
 */
export async function updateQuincenalIncome(formData: FormData) {
  const parsed = incomeSchema.parse({ quincenalIncome: formData.get("quincenalIncome") });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase
    .from("profiles")
    .update({ quincenal_income: round2(parsed.quincenalIncome) })
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "budget.income.update", meta: { quincenalIncome: parsed.quincenalIncome } });
  revalidatePath("/money/budget");
  revalidatePath("/home");
}
