// src/lib/identity/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";
import { PRINCIPIOS } from "@/lib/domain/identity/brief.ts";

const AREAS = ["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"] as const;

function repintar() {
  revalidatePath("/development/routines");
  revalidatePath("/development/routines/analytics");
  revalidatePath("/development");
}

const profileSchema = z.object({
  desiredIdentity: z.string().trim().min(1, "Escribe en quién te quieres convertir").max(280, "Hasta 280 caracteres"),
  visionStatement: z.string().trim().max(2000, "La visión admite hasta 2000 caracteres").default(""),
  // Llegan como una lista escrita a mano: se limpian aquí y no en el cliente,
  // porque el `check` de 0064 rechazaría con un 23514 sin explicación.
  coreValues: z
    .array(z.string().trim().max(40, "Cada valor, hasta 40 caracteres"))
    .transform((xs) => [...new Set(xs.filter(Boolean))])
    .pipe(z.array(z.string()).max(10, "Hasta 10 valores")),
  motivationalTone: z.enum(["sereno", "directo", "intenso"]),
  // Del catálogo de `brief.ts` y no de una lista escrita a mano: era el cuarto
  // sitio con los mismos cuatro nombres, y añadir el quinto (Dispenza) obligó
  // a tocarlos todos. Ahora este se entera solo.
  inspirations: z.array(z.enum(PRINCIPIOS))
});

export type IdentityProfileInput = z.input<typeof profileSchema>;

/** Crea o actualiza el perfil de identidad. El historial lo guarda el trigger de 0064. */
export async function upsertIdentityProfile(input: IdentityProfileInput): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { error } = await supabase.from("identity_profiles").upsert(
    {
      user_id: user.id,
      desired_identity: v.desiredIdentity,
      vision_statement: v.visionStatement,
      core_values: v.coreValues,
      motivational_tone: v.motivationalTone,
      inspirations: v.inspirations
    },
    { onConflict: "user_id" }
  );
  if (error) return actionFailed(error);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "identity.profile", object: user.id });
  repintar();
  return actionOk;
}

const traitSchema = z.object({
  name: z.string().trim().min(1, "Ponle nombre al rasgo").max(60, "Hasta 60 caracteres"),
  statement: z.string().trim().max(160, "Hasta 160 caracteres").default(""),
  area: z.enum(AREAS),
  active: z.boolean().default(true)
});

export type TraitInput = z.input<typeof traitSchema>;

/** Crea o edita un rasgo. Uno nuevo se coloca al final. */
export async function upsertTrait(id: string | null, input: TraitInput): Promise<ActionResult> {
  const parsed = traitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  if (id) {
    const { error } = await supabase.from("identity_traits").update(v).eq("id", id);
    if (error) return actionFailed(error);
  } else {
    const { count } = await supabase.from("identity_traits").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    const { error } = await supabase.from("identity_traits").insert({ ...v, user_id: user.id, position: count ?? 0 });
    if (error) return actionFailed(error);
  }

  repintar();
  return actionOk;
}

/**
 * Borra un rasgo. Sus votos se van con él (`on delete cascade`), y los hábitos
 * siguen existiendo: dejan de votar, no desaparecen. Para dejar de medirlo sin
 * perder el vínculo está desactivarlo.
 */
export async function deleteTrait(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { error } = await supabase.from("identity_traits").delete().eq("id", id);
  if (error) return actionFailed(error);
  repintar();
  return actionOk;
}
