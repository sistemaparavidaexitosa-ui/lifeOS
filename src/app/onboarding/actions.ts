"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/domain/datetime.ts";
import { createClient } from "@/lib/supabase/server";

const onboardingSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  currency: z.enum(["MXN", "USD", "EUR"]),
  // La zona horaria alimenta TODO cálculo de "hoy" (plan diario, hábitos,
  // vencidas, reportes). Guardar un valor que Intl no reconoce rompería esas
  // vistas, así que se valida aquí y no solo al leerla.
  timezone: z.string().min(1).refine(isValidTimeZone, { message: "Zona horaria no reconocida (ej. America/Mexico_City)" }),
  locale: z.enum(["es-MX", "es-ES", "en-US"]),
  cycle: z.enum(["Quincenal", "Mensual", "Semanal"]),
  activityStart: z.string().regex(/^\d{2}:\d{2}$/),
  activityEnd: z.string().regex(/^\d{2}:\d{2}$/),
  aiConsent: z.coerce.boolean()
});

export interface OnboardingState {
  error?: string;
}

/**
 * FR-USR-001, FR-TIM-002: crea/actualiza el perfil real en Supabase (no mock).
 *
 * Nota (16-ago-2026): este onboarding NO crea categorías de gasto por
 * defecto — decisión explícita del owner de que las categorías nunca se
 * gestionan/siembran desde un flujo de configuración/onboarding. Se
 * definen exclusivamente al crear el primer concepto en /money/budget (ver
 * upsertBudgetLine en src/app/(app)/money/budget/actions.ts), que las crea
 * automáticamente la primera vez que se escriben.
 */
export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    locale: formData.get("locale"),
    cycle: formData.get("cycle"),
    activityStart: formData.get("activityStart"),
    activityEnd: formData.get("activityEnd"),
    aiConsent: formData.get("aiConsent") === "on"
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  if (parsed.data.activityEnd <= parsed.data.activityStart) {
    return { error: "El fin del rango de actividad debe ser posterior al inicio (BR-017)." };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({
      name: parsed.data.name,
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      locale: parsed.data.locale,
      cycle: parsed.data.cycle,
      activity_window_start: parsed.data.activityStart,
      activity_window_end: parsed.data.activityEnd,
      onboarded: true
    })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  await supabase.from("consents").upsert(
    [
      { user_id: user.id, purpose: "core_app", version: "1.0", status: "granted" },
      { user_id: user.id, purpose: "ai_personalization", version: "1.0", status: parsed.data.aiConsent ? "granted" : "denied" }
    ],
    { onConflict: "user_id,purpose" }
  );

  // Si el usuario venía de un enlace (p. ej. /invite/[token]), vuelve ahí.
  // Solo rutas relativas: ver safeNext en (auth)/login/actions.ts.
  const next = formData.get("next");
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
  redirect(target);
}
