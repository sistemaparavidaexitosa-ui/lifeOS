// src/app/(app)/development/routines/reflection-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { todayForUser } from "@/lib/data/profile";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";

const reflectionSchema = z.object({
  mood: z.number().int().min(1).max(5).nullable(),
  energy: z.number().int().min(1).max(5).nullable(),
  // En medias horas: nadie sabe si durmió 6,3 horas, y el paso de 0,5 es lo
  // que admite `numeric(3,1)` sin redondeos sorpresa.
  sleepHours: z
    .number()
    .min(0)
    .max(24)
    .refine((n) => Number.isInteger(n * 2), "Las horas de sueño van de media en media")
    .nullable(),
  reflectionPrompt: z.string().max(300).default(""),
  reflection: z.string().max(2000, "La reflexión admite hasta 2000 caracteres").default(""),
  wins: z.string().max(1000, "Los logros admiten hasta 1000 caracteres").default("")
});

export type DailyReflectionInput = z.input<typeof reflectionSchema>;

/**
 * Guarda el check-in de HOY. Un upsert: el check-in del día se corrige, no se
 * acumula (`unique(user_id, local_date)` en 0063).
 *
 * La fecha la pone el servidor con la zona del perfil (D-016), no el cliente:
 * contestar a medianoche desde el teléfono de viaje no puede caer en otro día.
 */
export async function saveDailyReflection(input: DailyReflectionInput): Promise<ActionResult> {
  const parsed = reflectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { error } = await supabase.from("daily_reflections").upsert(
    {
      user_id: user.id,
      local_date: await todayForUser(),
      mood: v.mood,
      energy: v.energy,
      sleep_hours: v.sleepHours,
      reflection_prompt: v.reflectionPrompt.trim(),
      reflection: v.reflection.trim(),
      wins: v.wins.trim()
    },
    { onConflict: "user_id,local_date" }
  );
  if (error) return actionFailed(error);

  revalidatePath("/development/routines");
  return actionOk;
}
