"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/domain/datetime.ts";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  name: z.string().min(1),
  currency: z.enum(["MXN", "USD", "EUR"]),
  // La zona horaria alimenta TODO cálculo de "hoy" (plan diario, hábitos,
  // vencidas, reportes). Guardar un valor que Intl no reconoce rompería esas
  // vistas, así que se valida aquí y no solo al leerla.
  timezone: z.string().min(1).refine(isValidTimeZone, { message: "Zona horaria no reconocida (ej. America/Mexico_City)" }),
  locale: z.enum(["es-MX", "es-ES", "en-US"]),
  cycle: z.enum(["Quincenal", "Mensual", "Semanal"])
});

export async function updateProfile(formData: FormData) {
  const parsed = profileSchema.parse({
    name: formData.get("name"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    locale: formData.get("locale"),
    cycle: formData.get("cycle")
  });
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { error } = await supabase.from("profiles").update(parsed).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  await supabase.from("audit_log").insert({ user_id: user.id, action: "profile.update" });
  revalidatePath("/settings");
  revalidatePath("/home");
}

// Nota (16-ago-2026): se eliminó `addCategory` de este archivo — decisión
// explícita del owner de que las categorías de gasto NO se gestionan desde
// Configuración. Ahora se crean exclusivamente al escribir el nombre de un
// concepto nuevo en /money/budget (ver upsertBudgetLine en
// src/app/(app)/money/budget/actions.ts), que las crea automáticamente.

export async function toggleTheme(theme: "light" | "dark") {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  await supabase.from("profiles").update({ theme }).eq("user_id", user.id);
  revalidatePath("/settings");
}
