"use server";

// LO QUE PASA CUANDO ALGUIEN PULSA EL BOTÓN DE UNA PROPUESTA.
//
// NINGÚN CAMINO DE ESCRITURA NUEVO, y es la regla que ordena todo el archivo:
// aceptar una propuesta no escribe en `tasks`, `occupations`, `routines` ni
// `personal_goals`. Llama a la Server Action que YA crea esa cosa, con su zod,
// su `audit_log` y su `revalidatePath`. Es el mismo criterio de D-075 y de
// `createTaskFromChat`, y aquí importa más que en ningún otro sitio: el texto
// que originó el botón lo escribió un modelo.
//
// LO QUE SE VUELVE A COMPROBAR AQUÍ, aunque ya se comprobó al guardar: el
// `payload` sale de la base, pero el `id` que llega lo manda el navegador. Se
// carga la fila, se comprueba que es del usuario y que sigue pendiente, y se
// vuelve a sanear la forma antes de ejecutar nada.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/data/session";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";
import { sanearPropuesta, type PropuestaSaneada } from "@/lib/domain/coach/proposals.ts";
import { quickAddTask } from "@/lib/search/quick-add";
import { upsertOccupation } from "@/app/(app)/time/actions";
import { upsertRoutine } from "@/app/(app)/development/routines/actions";
import { upsertPersonalGoal } from "@/app/(app)/development/goals/actions";

export interface CoachProposalRow {
  id: string;
  messageId: string;
  tipo: string;
  titulo: string;
  detalle: string;
  payload: Record<string, string>;
}

/** Lo que se pinta debajo del turno del coach. Solo lo pendiente. */
export async function loadPendingProposals(): Promise<CoachProposalRow[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("coach_proposals")
    .select("id, message_id, tipo, titulo, detalle, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);

  return (data ?? []).map((r) => ({
    id: r.id,
    messageId: r.message_id,
    tipo: r.tipo,
    titulo: r.titulo,
    detalle: r.detalle,
    payload: (r.payload ?? {}) as Record<string, string>
  }));
}

/** Un FormData a partir del payload: es lo que esperan las acciones existentes. */
function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

/**
 * Ejecuta la propuesta reusando la acción de siempre.
 *
 * `estructura` es la única que NO crea nada, y es deliberado: el plan de un
 * proyecto se genera y se REVISA marcando qué fases entran (`applyAiPlan`
 * recibe una selección). Aplicarlo a ciegas desde un botón de la barra lateral
 * saltaría justo la revisión que ese flujo existe para tener. Así que devuelve
 * a dónde ir, y el usuario lo aprueba donde se ve lo que va a pasar.
 */
async function ejecutar(p: PropuestaSaneada, workspaceId: string | null): Promise<ActionResult & { href?: string }> {
  switch (p.tipo) {
    case "tarea": {
      if (!workspaceId) return { ok: false, reason: "No hay un espacio donde crear la tarea." };
      return quickAddTask(workspaceId, p.titulo);
    }

    case "bloque": {
      // Recurrente y todos los días: el coach propone un hueco que se repite
      // —«tu rutina de la mañana no está en la agenda»—, no una cita suelta.
      // Una fecha concreta caducaría mañana, que es lo contrario de anclar.
      const fd = formulario({ ...p.payload, recurring: "on" });
      for (const d of ["0", "1", "2", "3", "4", "5", "6"]) fd.append("days", d);
      return upsertOccupation(null, fd);
    }

    case "rutina":
      await upsertRoutine(null, formulario({ ...p.payload, active: "on" }));
      return actionOk;

    case "meta":
      await upsertPersonalGoal(null, formulario({ ...p.payload, status: "Activa" }));
      return actionOk;

    case "estructura":
      return { ...actionOk, href: `/execution?project=${p.payload.projectId}` };
  }
}

export async function acceptProposal(id: string, workspaceId: string | null): Promise<ActionResult & { href?: string }> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, reason: "Esa propuesta no existe." };

  const { supabase, user } = await requireUser();

  // Se relee de la base y no se confía en lo que mande el navegador. `.eq` por
  // usuario además de la RLS: defensa en profundidad, mismo criterio que el
  // resto de acciones que borran o modifican por id.
  const { data: fila } = await supabase
    .from("coach_proposals")
    .select("id, tipo, titulo, detalle, payload, status")
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!fila) return { ok: false, reason: "Esa propuesta ya no está." };
  // Pulsar dos veces no crea dos cosas. Es el mismo argumento que la
  // `dedupe_key` de las notificaciones, aplicado a un botón.
  if (fila.status !== "pending") return { ok: false, reason: "Esa propuesta ya se resolvió." };

  const limpia = sanearPropuesta({
    tipo: fila.tipo,
    titulo: fila.titulo,
    detalle: fila.detalle,
    datos: JSON.stringify(fila.payload ?? {})
  });
  if (!limpia) return { ok: false, reason: "Esa propuesta no se puede crear tal como quedó guardada." };

  const resultado = await ejecutar(limpia, workspaceId);
  // Solo se marca aceptada si de verdad se creó. Si la acción falló, la
  // propuesta sigue pendiente y el botón se puede volver a pulsar.
  if (!resultado.ok) return resultado;

  const { error } = await supabase
    .from("coach_proposals")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", parsed.data);
  if (error) return actionFailed(error);

  revalidatePath("/home");
  return resultado;
}

export async function dismissProposal(id: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, reason: "Esa propuesta no existe." };

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("coach_proposals")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", user.id);
  if (error) return actionFailed(error);

  revalidatePath("/home");
  return actionOk;
}
