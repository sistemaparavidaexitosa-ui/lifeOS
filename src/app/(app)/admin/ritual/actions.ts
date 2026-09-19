"use server";
// La escritura de la política del arranque guiado (D-165).
//
// La misma triple defensa que el catálogo de plantillas (0044): la ruta
// devuelve 404 a quien no es admin, la RLS de 0068 rechaza su `update`, y esta
// acción lo vuelve a preguntar — porque una Server Action es un endpoint HTTP y
// se puede invocar sin pasar por la pantalla.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirAdmin } from "@/lib/admin/guard";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";
import { PASOS_RITUAL } from "@/lib/domain/ritual/types.ts";

const politicaSchema = z
  .object({
    enabled: z.boolean(),
    steps: z.array(z.enum(PASOS_RITUAL)),
    windowStart: z.number().int().min(0).max(23),
    windowEnd: z.number().int().min(1).max(23),
    frequency: z.enum(["Diario", "Semanal", "Entre semana", "Fin de semana"]),
    aiEnabled: z.boolean(),
    blocking: z.boolean(),
    maxRoutineSteps: z.number().int().min(1).max(20)
  })
  // La base lo rechazaría igual (`check window_start < window_end`), pero con un
  // código de error que no le dice nada a quien está rellenando el formulario.
  .refine((p) => p.windowStart < p.windowEnd, { message: "La ventana tiene que empezar antes de terminar." });

export async function updateRitualPolicy(formData: FormData): Promise<ActionResult> {
  const sesion = await exigirAdmin("Solo un administrador puede cambiar el arranque guiado.");
  if ("error" in sesion) return sesion.error;

  const parsed = politicaSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    steps: PASOS_RITUAL.filter((p) => formData.get(`step.${p}`) === "on"),
    windowStart: Number(formData.get("windowStart")),
    windowEnd: Number(formData.get("windowEnd")),
    frequency: formData.get("frequency"),
    aiEnabled: formData.get("aiEnabled") === "on",
    blocking: formData.get("blocking") === "on",
    maxRoutineSteps: Number(formData.get("maxRoutineSteps"))
  });
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "Algún valor está fuera de rango." };
  }

  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("ritual_policy")
    .update({
      enabled: p.enabled,
      steps: p.steps,
      window_start: p.windowStart,
      window_end: p.windowEnd,
      frequency: p.frequency,
      ai_enabled: p.aiEnabled,
      blocking: p.blocking,
      max_routine_steps: p.maxRoutineSteps,
      updated_by: sesion.userId,
      updated_at: new Date().toISOString()
    })
    .eq("id", true);
  if (error) return actionFailed(error);

  await supabase.from("audit_log").insert({ user_id: sesion.userId, action: "ritual.policy.update" });

  // La puerta vive en el layout de `(app)`: sin revalidarlo, la política nueva
  // tarda en notarse y parece que no se guardó.
  revalidatePath("/", "layout");
  revalidatePath("/admin/ritual");
  revalidatePath("/settings");
  return actionOk;
}
