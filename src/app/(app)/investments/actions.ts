"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { todayForUser } from "@/lib/data/profile";
import { round2 } from "@/lib/domain/budget.ts";
import { describeDbError } from "@/lib/supabase/errors";
import { borradoPermitido, retiroPermitido, TIPOS_DE_MOVIMIENTO } from "@/lib/domain/money/curva-inversion.ts";
import { fdate } from "@/lib/format";
import { leerPosicion } from "@/lib/money/inversiones";

export type ResultadoDeAccion = { ok: true } | { ok: false; reason: string };

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const UUID = z.string().uuid();

/** Lo que describe una posición. Capital y valor ya no: salen de sus movimientos (D-200). */
const posicionSchema = z.object({
  kind: z.enum(["fija", "variable"]),
  name: z.string().trim().min(1, "Falta el instrumento."),
  institutionOrBroker: z.string().optional().default(""),
  rate: z.coerce.number().default(0),
  source: z.string().trim().min(1, "Falta la fuente."),
  familyMemberId: z.string().uuid().optional().or(z.literal(""))
});

function leerPosicionDe(fd: FormData) {
  return posicionSchema.safeParse({
    kind: fd.get("kind"),
    name: fd.get("name"),
    institutionOrBroker: fd.get("institutionOrBroker") ?? "",
    rate: fd.get("rate") || 0,
    source: fd.get("source"),
    familyMemberId: fd.get("familyMemberId") ?? ""
  });
}

const primerError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos.";

function revalidar(id?: string) {
  revalidatePath("/investments");
  if (id) revalidatePath(`/investments/${id}`);
}

/** FR-INV-001…007. Alta con su aportación inicial, atómica (`crear_posicion`). */
export async function crearPosicion(fd: FormData): Promise<ResultadoDeAccion & { id?: string }> {
  const p = leerPosicionDe(fd);
  if (!p.success) return { ok: false, reason: primerError(p.error) };
  const inicial = z
    .object({ monto: z.coerce.number().positive("La aportación inicial tiene que ser mayor que 0.").max(1e12), fecha: FECHA })
    .safeParse({ monto: fd.get("monto"), fecha: fd.get("fecha") });
  if (!inicial.success) return { ok: false, reason: primerError(inicial.error) };

  const { supabase, user } = await requireUser();
  if (inicial.data.fecha > (await todayForUser())) return { ok: false, reason: "La fecha no puede ser futura." };
  const { data: perfil } = await supabase.from("profiles").select("currency").eq("user_id", user.id).single();

  const { data, error } = await supabase.rpc("crear_posicion", {
    p_kind: p.data.kind,
    p_name: p.data.name,
    p_institution: p.data.kind === "fija" ? p.data.institutionOrBroker : "",
    p_broker: p.data.kind === "variable" ? p.data.institutionOrBroker : "",
    p_rate: p.data.rate,
    p_source: p.data.source,
    p_currency: perfil?.currency ?? "MXN",
    p_monto: round2(inicial.data.monto),
    p_fecha: inicial.data.fecha,
    ...(p.data.familyMemberId ? { p_family_member_id: p.data.familyMemberId } : {})
  });
  if (error) return { ok: false, reason: describeDbError(error) };
  revalidar(data ?? undefined);
  return { ok: true, id: data ?? undefined };
}

export async function actualizarPosicion(id: string, fd: FormData): Promise<ResultadoDeAccion> {
  if (!UUID.safeParse(id).success) return { ok: false, reason: "Posición inválida." };
  const p = leerPosicionDe(fd);
  if (!p.success) return { ok: false, reason: primerError(p.error) };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("investments")
    .update({
      kind: p.data.kind,
      name: p.data.name,
      institution: p.data.kind === "fija" ? p.data.institutionOrBroker : "",
      broker: p.data.kind === "variable" ? p.data.institutionOrBroker : "",
      rate: p.data.rate,
      source: p.data.source,
      family_member_id: p.data.familyMemberId || null
    })
    .eq("id", id);
  if (error) return { ok: false, reason: describeDbError(error) };
  revalidar(id);
  return { ok: true };
}

export async function deleteInvestment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("investments").delete().eq("id", id);
  if (error) throw new Error(describeDbError(error));
  revalidatePath("/investments");
}

const movimientoSchema = z
  .object({
    kind: z.enum(TIPOS_DE_MOVIMIENTO),
    amount: z.coerce.number().min(0).max(1e12),
    occurredOn: FECHA,
    note: z.string().trim().max(200).default("")
  })
  .refine((m) => m.kind === "valuacion" || m.amount > 0, { message: "El monto tiene que ser mayor que 0.", path: ["amount"] });

/**
 * La MISMA acción desde /investments/[id] y desde el Centro (D-202): lo que
 * propone el agente pasa por aquí igual que lo que teclea la persona.
 */
export async function registrarMovimiento(investmentId: string, fd: FormData): Promise<ResultadoDeAccion> {
  if (!UUID.safeParse(investmentId).success) return { ok: false, reason: "Posición inválida." };
  const m = movimientoSchema.safeParse({
    kind: fd.get("kind"),
    amount: fd.get("amount"),
    occurredOn: fd.get("occurredOn"),
    note: fd.get("note") ?? ""
  });
  if (!m.success) return { ok: false, reason: primerError(m.error) };

  const { supabase, user } = await requireUser();
  if (m.data.occurredOn > (await todayForUser())) return { ok: false, reason: "La fecha no puede ser futura." };

  const posicion = await leerPosicion(supabase, investmentId);
  if (!posicion) return { ok: false, reason: "No encuentro esa inversión." };

  const amount = round2(m.data.amount);
  if (m.data.kind === "retiro" && !retiroPermitido(posicion.movimientos, { amount, occurred_on: m.data.occurredOn })) {
    return { ok: false, reason: `El retiro supera el valor de la posición al ${fdate(m.data.occurredOn)} o deja negativo lo registrado después.` };
  }

  const { error } = await supabase.from("investment_movements").insert({
    user_id: user.id,
    investment_id: investmentId,
    kind: m.data.kind,
    amount,
    occurred_on: m.data.occurredOn,
    note: m.data.note
  });
  if (error) return { ok: false, reason: describeDbError(error) };
  revalidar(investmentId);
  return { ok: true };
}

export async function borrarMovimiento(id: string, investmentId: string): Promise<ResultadoDeAccion> {
  if (!UUID.safeParse(id).success || !UUID.safeParse(investmentId).success) return { ok: false, reason: "Movimiento inválido." };
  const { supabase } = await requireUser();
  // Borrar una aportación puede dejar negativo un retiro posterior: se mira la
  // curva que quedaría antes de borrar (revisión final, D-200).
  const posicion = await leerPosicion(supabase, investmentId);
  if (!posicion) return { ok: false, reason: "No encuentro esa inversión." };
  if (!borradoPermitido(posicion.movimientos, id)) {
    return { ok: false, reason: "Sin este movimiento, la posición quedaría en negativo: borra antes el retiro que depende de él." };
  }
  const { error } = await supabase.from("investment_movements").delete().eq("id", id).eq("investment_id", investmentId);
  if (error) return { ok: false, reason: describeDbError(error) };
  revalidar(investmentId);
  return { ok: true };
}
