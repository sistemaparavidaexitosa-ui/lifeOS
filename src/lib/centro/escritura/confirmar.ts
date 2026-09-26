// src/lib/centro/escritura/confirmar.ts
// Guardar o descartar lo que el Centro propuso (D-203).
//
// EL NAVEGADOR SOLO MANDA UN ID (y, si la persona corrigió algo, esos campos).
// Lo que se escribe sale de `coach_proposals.payload`, que se vuelve a pasar
// por el registro y por `ai_domains` AHORA, no cuando se propuso.
//
// Reclamo `pending → aplicando` como `acceptProposal`: dos clics a la vez no
// escriben dos veces.
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/data/session";
import { allowedDomains } from "@/lib/insights/context";
import { actionFailed, type ActionResult } from "@/lib/supabase/errors";
import { revalidarGuardado, aplicarCorrecciones } from "@/lib/domain/centro/escritura/cambio.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";
import { ADAPTADORES, type Adaptador } from "./adaptadores";

const correccionesSchema = z.record(z.string().max(20000)).default({});

export async function confirmarCambio(
  propuestaId: string,
  correcciones: Record<string, string> = {}
): Promise<ActionResult & { yaGuardado?: boolean }> {
  const id = z.string().uuid().safeParse(propuestaId);
  const corr = correccionesSchema.safeParse(correcciones);
  if (!id.success || !corr.success) return { ok: false, reason: "Esta propuesta no existe." };

  const { supabase, user } = await requireUser();

  const [{ data: fila }, { data: perfil }] = await Promise.all([
    supabase.from("coach_proposals").select("id, tipo, payload, status").eq("id", id.data).eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("ai_domains").eq("user_id", user.id).single()
  ]);
  if (!fila || fila.tipo !== "cambio") return { ok: false, reason: "Esta propuesta ya no está." };
  if (fila.status === "accepted") return { ok: false, yaGuardado: true, reason: "Ya guardado." };
  if (fila.status !== "pending") return { ok: false, reason: "Esta propuesta ya se resolvió." };

  // Los mismos dominios que el cerebro: el opt-in de la persona ∩ lo global.
  const activos = (perfil?.ai_domains ?? []) as Domain[];
  const autorizados = allowedDomains("global").filter((d) => activos.includes(d));

  const valido = revalidarGuardado(fila.payload, autorizados);
  if (!valido.ok) return valido;
  const corregido = aplicarCorrecciones(valido.cambio, corr.data);
  if (!corregido.ok) return corregido;
  const cambio = corregido.cambio;

  if (cambio.operacion !== "crear") {
    // La unión de tablas del registro le complica a `tsc` un `.from` dinámico;
    // todas tienen `id`, así que basta afirmarla en esta sola línea.
    const { data: existe } = await supabase.from(cambio.tabla as "tasks").select("id").eq("id", cambio.id!).maybeSingle();
    if (!existe) {
      await supabase
        .from("coach_proposals")
        .update({ status: "dismissed", resolved_at: new Date().toISOString() })
        .eq("id", id.data)
        .eq("status", "pending");
      return { ok: false, reason: "Esta fila ya no existe o cambió; vuelve a pedírselo al Centro." };
    }
  }

  const { data: reclamada } = await supabase
    .from("coach_proposals")
    .update({ status: "aplicando" })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!reclamada) return { ok: false, yaGuardado: true, reason: "Ya guardado." };

  const adaptador = (ADAPTADORES[cambio.tabla] as Record<string, Adaptador>)[cambio.operacion]!;
  const resultado = await adaptador(cambio);

  if (!resultado.ok) {
    await supabase.from("coach_proposals").update({ status: "pending" }).eq("id", id.data).eq("status", "aplicando");
    return resultado;
  }

  const { error } = await supabase
    .from("coach_proposals")
    .update({ status: "accepted", resolved_at: new Date().toISOString(), payload: cambio as unknown as Record<string, never> })
    .eq("id", id.data)
    .eq("status", "aplicando");
  if (error) return actionFailed(error);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "ai.centro_escritura",
    object: cambio.id ?? cambio.tabla,
    meta: { tabla: cambio.tabla, operacion: cambio.operacion, propuestaId: id.data, corregidos: Object.keys(corr.data) }
  });
  revalidatePath("/home");
  return { ok: true };
}

export async function descartarCambio(propuestaId: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(propuestaId);
  if (!id.success) return { ok: false, reason: "Esta propuesta no existe." };
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("coach_proposals")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .eq("tipo", "cambio")
    .eq("status", "pending");
  return error ? actionFailed(error) : { ok: true };
}
