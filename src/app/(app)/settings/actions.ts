"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/domain/datetime.ts";
import { requireUser } from "@/lib/data/session";
import { actionFailed, actionOk, describeDbError, type ActionResult } from "@/lib/supabase/errors";

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
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update(parsed).eq("user_id", user.id);
  if (error) throw new Error(describeDbError(error));
  await supabase.from("audit_log").insert({ user_id: user.id, action: "profile.update" });
  revalidatePath("/settings");
  revalidatePath("/home");
}

// Nota (16-ago-2026): se eliminó `addCategory` de este archivo — decisión
// explícita del owner de que las categorías de gasto NO se gestionan desde
// Configuración. Ahora se crean exclusivamente al escribir el nombre de un
// concepto nuevo en /money/budget (ver upsertBudgetLine en
// src/app/(app)/money/budget/actions.ts), que las crea automáticamente.

/**
 * LAS PREFERENCIAS DE AVISO, QUE HASTA AHORA NO SE PODÍAN GUARDAR.
 *
 * `notification_prefs` existe desde 0049 con su esquema, su RLS y un defecto
 * sensato («sin fila = todo encendido»), y el único código que la tocaba era el
 * despachador, que la LEE. No había pantalla ni acción que la escribiera, así
 * que la hora del resumen y los interruptores por tipo eran inalcanzables desde
 * el producto. Esta es la mitad que faltaba.
 *
 * `upsert` y no `update`: la ausencia de fila es el estado normal de quien
 * nunca tocó esto, y un `update` sobre una fila que no existe no falla —no
 * hace nada—, que es la forma más silenciosa posible de no guardar.
 */
const prefsSchema = z.object({
  mentions: z.boolean(),
  assignments: z.boolean(),
  reminders: z.boolean(),
  dueDigest: z.boolean(),
  digestHour: z.number().int().min(0).max(23),
  coachEnabled: z.boolean(),
  coachMorningHour: z.number().int().min(0).max(23),
  coachNightHour: z.number().int().min(0).max(23)
});

/** Una casilla que no viaja en el FormData está desmarcada; el navegador no la manda. */
function casilla(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function hora(formData: FormData, name: string, porDefecto: number): number {
  const raw = Number(formData.get(name));
  return Number.isInteger(raw) ? raw : porDefecto;
}

export async function updateNotificationPrefs(formData: FormData): Promise<ActionResult> {
  const parsed = prefsSchema.safeParse({
    mentions: casilla(formData, "mentions"),
    assignments: casilla(formData, "assignments"),
    reminders: casilla(formData, "reminders"),
    dueDigest: casilla(formData, "dueDigest"),
    digestHour: hora(formData, "digestHour", 8),
    coachEnabled: casilla(formData, "coachEnabled"),
    coachMorningHour: hora(formData, "coachMorningHour", 7),
    coachNightHour: hora(formData, "coachNightHour", 21)
  });
  if (!parsed.success) return { ok: false, reason: "Alguna hora está fuera del rango 0-23." };

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("notification_prefs").upsert(
    {
      user_id: user.id,
      mentions: parsed.data.mentions,
      assignments: parsed.data.assignments,
      reminders: parsed.data.reminders,
      due_digest: parsed.data.dueDigest,
      digest_hour: parsed.data.digestHour,
      coach_enabled: parsed.data.coachEnabled,
      coach_morning_hour: parsed.data.coachMorningHour,
      coach_night_hour: parsed.data.coachNightHour
    },
    { onConflict: "user_id" }
  );
  if (error) return actionFailed(error);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "notifications.prefs.update" });
  revalidatePath("/settings");
  return actionOk;
}

export async function toggleTheme(theme: "light" | "dark") {
  const { supabase, user } = await requireUser();
  await supabase.from("profiles").update({ theme }).eq("user_id", user.id);
  revalidatePath("/settings");
}
