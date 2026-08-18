"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/domain/budget.ts";

// PUNTO 5 (fix del error "An error occurred in the Server Components render"
// al EDITAR un ítem de presupuesto):
//
// Causa raíz: al editar, el formulario no enviaba el campo `category` (en modo
// edición la categoría no se cambia), pero el schema anterior lo exigía como
// obligatorio para AMBOS flujos (crear y editar). Al faltar, z.parse lanzaba un
// ZodError dentro de la Server Action, que en producción se propaga como el
// error genérico de Server Components (mensaje omitido + digest).
//
// Fix: se separan los schemas de CREAR (requiere category) y EDITAR (NO requiere
// category, porque no se modifica). Así editar solo valida los montos y nunca
// lanza por una categoría ausente.

const editLineSchema = z.object({
  monthlyCost: z.coerce.number().min(0),
  q1Amount: z.coerce.number().min(0),
  q2Amount: z.coerce.number().min(0)
});

const createLineSchema = editLineSchema.extend({
  category: z.string().min(1, "Escribe el nombre del concepto")
});

/**
 * FR-MNY-018/019: crea o edita un concepto de la pestaña de presupuesto.
 * Reutiliza budgets (D-003).
 * Diseño (16-ago-2026): las categorías de gasto NO se gestionan desde
 * Configuración. El nombre del concepto se escribe al crear el presupuesto;
 * si esa categoría no existe todavía en public.categories, se crea
 * automáticamente (upsert idempotente vía el índice único
 * categories(user_id, name), ver 0005_money_ledger_budget.sql).
 */
export async function upsertBudgetLine(id: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // ---------------------------------------------------------------------------
  // EDICIÓN: no requiere category (no se cambia). Fix del PUNTO 5.
  // ---------------------------------------------------------------------------
  if (id) {
    const parsed = editLineSchema.parse({
      monthlyCost: formData.get("monthlyCost"),
      q1Amount: formData.get("q1Amount"),
      q2Amount: formData.get("q2Amount")
    });
    if (parsed.monthlyCost <= 0) throw new Error("Costo mensual inválido");

    const { error } = await supabase
      .from("budgets")
      .update({
        monthly_cost: round2(parsed.monthlyCost),
        q1_amount: round2(parsed.q1Amount),
        q2_amount: round2(parsed.q2Amount),
        amount: round2(parsed.monthlyCost / 2),
        cycle: "Quincenal"
      })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({ user_id: user.id, action: "budget.update", object: id });
    revalidatePath("/money/budget");
    revalidatePath("/money");
    revalidatePath("/home");
    return;
  }

  // ---------------------------------------------------------------------------
  // CREACIÓN: sí requiere category.
  // ---------------------------------------------------------------------------
  const parsed = createLineSchema.parse({
    category: formData.get("category"),
    monthlyCost: formData.get("monthlyCost"),
    q1Amount: formData.get("q1Amount"),
    q2Amount: formData.get("q2Amount")
  });
  if (parsed.monthlyCost <= 0) throw new Error("Costo mensual inválido");

  const category = parsed.category.trim();
  if (!category) throw new Error("Escribe el nombre del concepto");

  // Evita sobrescribir en silencio un concepto ya existente para la misma categoría.
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

  // Crea la categoría automáticamente si es nueva (idempotente).
  await supabase.from("categories").upsert({ user_id: user.id, name: category }, { onConflict: "user_id,name" });

  const { error } = await supabase.from("budgets").insert({
    user_id: user.id,
    period: "current",
    category,
    monthly_cost: round2(parsed.monthlyCost),
    q1_amount: round2(parsed.q1Amount),
    q2_amount: round2(parsed.q2Amount),
    amount: round2(parsed.monthlyCost / 2),
    cycle: "Quincenal"
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "budget.create", object: category });
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
 * Extensión Presupuesto: guarda el ingreso quincenal declarado por el usuario
 * (profiles.quincenal_income). Se usa en budget/page.tsx para calcular la
 * diferencia si las aportaciones Q1/Q2 exceden ese ingreso.
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
