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
import {
  revalidarGuardado,
  aplicarCorrecciones,
  valoresIguales,
  type CambioGuardado
} from "@/lib/domain/centro/escritura/cambio.ts";
import { ESCRITURA_POR_TABLA } from "@/lib/domain/centro/escritura/registro.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";
import { ADAPTADORES, type Adaptador } from "./adaptadores";

const correccionesSchema = z.record(z.string().max(20000)).default({});

type Cliente = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Columnas del registro que también viajaron en el `antes` leído al proponer. */
function columnasComparables(cambio: CambioGuardado): string[] {
  const campos = ESCRITURA_POR_TABLA[cambio.tabla].campos;
  const antes = cambio.antes ?? {};
  return Object.keys(campos).filter((k) => k in antes);
}

/**
 * I4: la fila puede haber cambiado entre proponer y confirmar (otra persona
 * la editó, o ya no existe). Compara el `antes` que se leyó al proponer con
 * lo que hay ahora, columna por columna, no solo si la fila sigue existiendo.
 * Sin columnas comparables (registro sin solape con lo leído), se cae a solo
 * existencia.
 */
async function filaSigueVigente(supabase: Cliente, cambio: CambioGuardado): Promise<boolean> {
  const columnas = columnasComparables(cambio);
  // La unión de tablas del registro le complica a `tsc` un `.from` dinámico;
  // todas tienen `id`, así que basta afirmarla en esta sola línea. La lista de
  // columnas es de por sí dinámica (`string`, no un literal): se construye
  // fuera de `.select()` para que el parser de tipos de Supabase no intente
  // leerla como una plantilla literal.
  const query: string = columnas.length ? ["id", ...columnas].join(", ") : "id";
  const { data: fresca } = await supabase.from(cambio.tabla as "tasks").select(query).eq("id", cambio.id!).maybeSingle();
  if (!fresca) return false;
  const antes = cambio.antes ?? {};
  const filaFresca = fresca as unknown as Record<string, unknown>;
  return columnas.every((k) => valoresIguales(filaFresca[k], antes[k]));
}

/**
 * I1: un adaptador que dice `ok` no basta. Una fila que la persona puede LEER
 * pero no ESCRIBIR (RLS de solo lectura en un proyecto compartido) deja un
 * `update`/`delete` en cero filas sin ningún error — hay que releer y
 * comprobar que el efecto de verdad ocurrió antes de dar la propuesta por
 * aplicada.
 */
async function efectoAplicado(supabase: Cliente, cambio: CambioGuardado): Promise<boolean> {
  if (cambio.operacion === "borrar") {
    const { data } = await supabase.from(cambio.tabla as "tasks").select("id").eq("id", cambio.id!).maybeSingle();
    return !data;
  }
  const columnas = Object.keys(cambio.campos);
  if (!columnas.length) return true;
  const query: string = columnas.join(", ");
  const { data } = await supabase.from(cambio.tabla as "tasks").select(query).eq("id", cambio.id!).maybeSingle();
  if (!data) return false;
  const filaFresca = data as unknown as Record<string, unknown>;
  return columnas.every((k) => valoresIguales(filaFresca[k], cambio.campos[k]));
}

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

  if (cambio.operacion !== "crear" && !(await filaSigueVigente(supabase, cambio))) {
    await supabase
      .from("coach_proposals")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", id.data)
      .eq("status", "pending");
    return { ok: false, reason: "Esta fila ya no existe o cambió; vuelve a pedírselo al Centro." };
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

  // I1: el adaptador dijo `ok`, pero eso no distingue «escribió» de «la RLS
  // dejó pasar un update/delete de cero filas sin error». Se relee antes de
  // dar la propuesta por aplicada.
  if (cambio.operacion !== "crear" && !(await efectoAplicado(supabase, cambio))) {
    await supabase.from("coach_proposals").update({ status: "pending" }).eq("id", id.data).eq("status", "aplicando");
    return { ok: false, reason: "No tienes permiso para cambiar esto, o no se aplicó." };
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
    // I3: en un `crear`, `cambio.id` es siempre `null` — el id real de la fila
    // creada solo lo tiene `resultado` (lo propaga `seguro` desde la Server
    // Action).
    object: cambio.id ?? resultado.id ?? cambio.tabla,
    meta: {
      tabla: cambio.tabla,
      operacion: cambio.operacion,
      id: cambio.id ?? resultado.id ?? null,
      propuestaId: id.data,
      corregidos: Object.keys(corr.data)
    }
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
