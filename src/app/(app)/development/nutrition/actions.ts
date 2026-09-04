"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { scalePer100g } from "@/lib/domain/development/nutrition.ts";
import { plausibleMacros } from "@/lib/domain/development/nutrition-lookup.ts";

/**
 * Acciones del diario de nutrición.
 *
 * LO QUE LLEGA DEL FORMULARIO NO SE GUARDA TAL CUAL. Los macros viajan en
 * campos ocultos —los pone el buscador— y eso lo edita cualquiera con las
 * herramientas del navegador. Aquí se recalculan desde `(per100g, gramos)` y
 * se vuelven a pasar por `plausibleMacros`, que es el mismo razonamiento por
 * el que `isAllowedCoverUrl` se comprueba al guardar y no solo al buscar.
 */

function repintar() {
  revalidatePath("/development/nutrition");
  revalidatePath("/development");
  revalidatePath("/home");
}

const perfilSchema = z.object({
  sex: z.enum(["Hombre", "Mujer"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de nacimiento no es válida."),
  heightCm: z.coerce.number().min(80).max(250),
  weightKg: z.coerce.number().min(25).max(400),
  activityLevel: z.enum(["Sedentario", "Ligero", "Moderado", "Alto", "Muy alto"]),
  goal: z.enum(["Perder", "Mantener", "Ganar"]),
  proteinGPerKg: z.coerce.number().min(0.5).max(3),
  fatPct: z.coerce.number().int().min(15).max(45),
  // El suelo de 1000 lo defiende también la base. Aquí se repite para poder
  // dar un motivo legible en vez de un error de restricción.
  kcalOverride: z.coerce.number().int().min(1000).max(6000).nullable().optional()
});

export async function upsertBodyProfile(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const overrideCrudo = String(formData.get("kcalOverride") ?? "").trim();
  const parsed = perfilSchema.safeParse({
    sex: formData.get("sex"),
    birthDate: formData.get("birthDate"),
    heightCm: formData.get("heightCm"),
    weightKg: formData.get("weightKg"),
    activityLevel: formData.get("activityLevel"),
    goal: formData.get("goal"),
    proteinGPerKg: formData.get("proteinGPerKg"),
    fatPct: formData.get("fatPct"),
    kcalOverride: overrideCrudo === "" ? null : overrideCrudo
  });
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "Revisa los datos del perfil." };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const { error } = await supabase.from("nutrition_profiles").upsert(
    {
      user_id: user.id,
      sex: parsed.data.sex,
      birth_date: parsed.data.birthDate,
      height_cm: parsed.data.heightCm,
      weight_kg: parsed.data.weightKg,
      activity_level: parsed.data.activityLevel,
      goal: parsed.data.goal,
      protein_g_per_kg: parsed.data.proteinGPerKg,
      fat_pct: parsed.data.fatPct,
      kcal_override: parsed.data.kcalOverride ?? null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (error) return { ok: false, reason: error.message };

  repintar();
  return { ok: true };
}

const pesoSchema = z.object({
  weightKg: z.coerce.number().min(25).max(400),
  bodyFatPct: z.coerce.number().min(2).max(70).nullable().optional()
});

/**
 * Anota el peso del día. Escribe en DOS sitios y es el único dato duplicado
 * del módulo: `body_measurements` guarda el histórico —del que sale la
 * tendencia y la meta que se mide sola— y `nutrition_profiles.weight_kg`
 * guarda el vigente, porque el cálculo de objetivos no puede depender de que
 * exista una medición de hoy.
 */
export async function upsertWeight(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const grasaCruda = String(formData.get("bodyFatPct") ?? "").trim();
  const parsed = pesoSchema.safeParse({
    weightKg: formData.get("weightKg"),
    bodyFatPct: grasaCruda === "" ? null : grasaCruda
  });
  if (!parsed.success) return { ok: false, reason: "El peso no es un valor válido." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const hoy = todayLocal(await getUserTimeZone());

  const { error } = await supabase.from("body_measurements").upsert(
    {
      user_id: user.id,
      local_date: hoy,
      weight_kg: parsed.data.weightKg,
      body_fat_pct: parsed.data.bodyFatPct ?? null
    },
    { onConflict: "user_id,local_date" }
  );
  if (error) return { ok: false, reason: error.message };

  await supabase.from("nutrition_profiles").update({ weight_kg: parsed.data.weightKg }).eq("user_id", user.id);

  repintar();
  return { ok: true };
}

const entradaSchema = z.object({
  meal: z.enum(["Desayuno", "Almuerzo", "Cena", "Snack"]),
  name: z.string().min(1, "Ponle nombre al alimento.").max(200),
  brand: z.string().max(120).optional().default(""),
  grams: z.coerce.number().positive().max(5000),
  foodId: z.string().uuid().nullable().optional(),
  kcal100: z.coerce.number().min(0).max(900),
  protein100: z.coerce.number().min(0).max(100).default(0),
  carbs100: z.coerce.number().min(0).max(100).default(0),
  fat100: z.coerce.number().min(0).max(100).default(0)
});

function leerEntrada(formData: FormData) {
  const foodId = String(formData.get("foodId") ?? "").trim();
  return entradaSchema.safeParse({
    meal: formData.get("meal"),
    name: formData.get("name"),
    brand: formData.get("brand") ?? "",
    grams: formData.get("grams"),
    foodId: foodId === "" ? null : foodId,
    kcal100: formData.get("kcal100"),
    protein100: formData.get("protein100") ?? 0,
    carbs100: formData.get("carbs100") ?? 0,
    fat100: formData.get("fat100") ?? 0
  });
}

/** Los macros que de verdad se guardan, recalculados en el servidor. */
function filaDesde(parsed: z.infer<typeof entradaSchema>) {
  const per100g = {
    kcal: parsed.kcal100,
    proteinG: parsed.protein100,
    carbsG: parsed.carbs100,
    fatG: parsed.fat100
  };
  if (!plausibleMacros(per100g)) return null;

  const m = scalePer100g(per100g, parsed.grams);
  return {
    meal: parsed.meal,
    name: parsed.name.trim(),
    brand: parsed.brand.trim(),
    grams: parsed.grams,
    food_id: parsed.foodId ?? null,
    kcal: m.kcal,
    protein_g: m.proteinG,
    carbs_g: m.carbsG,
    fat_g: m.fatG
  };
}

export async function logFoodEntry(localDate: string, formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const parsed = leerEntrada(formData);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "Revisa el alimento." };

  const fila = filaDesde(parsed.data);
  if (!fila) return { ok: false, reason: "Los valores nutricionales de ese alimento no cuadran." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const dia = /^\d{4}-\d{2}-\d{2}$/.test(localDate) ? localDate : todayLocal(await getUserTimeZone());

  // La posición se toma del final de esa comida en ese día: el orden en que se
  // registró es el orden en que se comió, y es el que la pantalla enseña.
  const { count } = await supabase
    .from("food_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("local_date", dia)
    .eq("meal", fila.meal);

  const { error } = await supabase
    .from("food_entries")
    .insert({ ...fila, user_id: user.id, local_date: dia, position: count ?? 0 });
  if (error) return { ok: false, reason: error.message };

  repintar();
  return { ok: true };
}

export async function updateFoodEntry(id: string, formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const parsed = leerEntrada(formData);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "Revisa el alimento." };

  const fila = filaDesde(parsed.data);
  if (!fila) return { ok: false, reason: "Los valores nutricionales de ese alimento no cuadran." };

  const supabase = await createClient();
  const { error } = await supabase.from("food_entries").update(fila).eq("id", id);
  if (error) return { ok: false, reason: error.message };

  repintar();
  return { ok: true };
}

/**
 * Registrar una comida DESDE la rutina: escribe la entrada del diario y marca
 * el hábito, en una sola acción del usuario.
 *
 * No es un atajo automático — solo corre si la persona rellena y envía el
 * formulario (D-089/D-105). Lo que evita es el doble trabajo de registrar la
 * comida en un sitio y marcar el hábito en otro, que es lo que hace que uno de
 * los dos se abandone.
 *
 * El `habit_logs` se inserta con `ignoreDuplicates`: la fila puede existir ya
 * —el usuario marcó el hábito antes de registrar la comida— y ahí no hay nada
 * que corregir. El índice único de (habit_id, log_date) hace el resto.
 */
export async function logMealFromRoutine(
  habitId: string,
  formData: FormData
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const hoy = todayLocal(await getUserTimeZone());

  // La comida primero: si no se puede registrar, el hábito no se marca. Al
  // revés dejaría un hábito «cumplido» sin nada detrás.
  const resultado = await logFoodEntry(hoy, formData);
  if (!resultado.ok) return resultado;

  const { error } = await supabase
    .from("habit_logs")
    .upsert({ habit_id: habitId, log_date: hoy }, { onConflict: "habit_id,log_date", ignoreDuplicates: true });
  if (error) return { ok: false, reason: error.message };

  await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.complete", object: habitId });

  revalidatePath("/development/routines");
  repintar();
  return { ok: true };
}

export async function deleteFoodEntry(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("food_entries").delete().eq("id", id);
  repintar();
}
