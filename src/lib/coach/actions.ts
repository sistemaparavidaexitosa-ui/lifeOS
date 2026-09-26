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
import { createNote, saveNote, deleteNote } from "@/app/(app)/notebooks/actions";
import { upsertOccupation } from "@/app/(app)/time/actions";
import { upsertRoutine } from "@/app/(app)/development/routines/actions";
import { upsertPersonalGoal } from "@/app/(app)/development/goals/actions";

export interface CoachProposalRow {
  id: string;
  messageId: string | null;
  tipo: string;
  titulo: string;
  detalle: string;
  payload: Record<string, string>;
}

/** Lo que se pinta debajo del turno del coach. Solo lo pendiente. */
export async function loadPendingProposals(): Promise<CoachProposalRow[]> {
  const { supabase } = await requireUser();
  // `cambio` (D-203) se pinta en el Centro con su tarjeta de diff; la barra
  // del chat no sabe aceptarlo y sería un botón que falla.
  const { data } = await supabase
    .from("coach_proposals")
    .select("id, message_id, tipo, titulo, detalle, payload")
    .eq("status", "pending")
    .neq("tipo", "cambio")
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

    case "nota": {
      // La idea que se escribió en la barra del centro (D-168). Se crea con las
      // dos acciones de siempre —`createNote` deja la nota vacía y `saveNote` le
      // pone el texto—, y no con un `insert` a mano: así hereda su validación,
      // su concurrencia optimista y su registro.
      const creada = await createNote(p.payload.notebookId ?? "");
      if (!creada.ok || !creada.id) return { ok: false, reason: creada.reason ?? "No se pudo crear la nota." };

      // VERSIÓN 1, no 0: una nota recién creada nace en 1, y `saveNote` compara
      // la versión EXACTA (concurrencia optimista). Con 0 el update no encuentra
      // fila, no falla ruidosamente y deja una nota vacía en el cuaderno. Lo
      // cazó la prueba de navegador.
      const guardada = await saveNote(creada.id, p.titulo, p.payload.cuerpo ?? "", 1);
      if (!guardada.ok) {
        // Sin esto, cada intento fallido dejaría una nota en blanco que la
        // persona tendría que borrar a mano.
        await deleteNote(creada.id);
        return { ok: false, reason: guardada.reason ?? "No se pudo guardar la nota." };
      }
      return { ...actionOk, href: `/notebooks?notebook=${p.payload.notebookId}` };
    }

    case "foco":
      // NO CREA NADA, igual que `estructura` y por un motivo parecido: «sigue
      // con el proyecto en el que estabas» no es algo que haya que crear, es un
      // sitio al que volver. El destino ya viene validado contra el menú y
      // contra los proyectos reales (`destinoValido`, D-167), así que aquí solo
      // se devuelve para que la pantalla navegue.
      return { ...actionOk, href: p.payload.href };

    case "arista":
      // No pasa por aquí: `acceptProposal` la manda a `aceptarArista`, que
      // reclama y escribe en una sola transacción de base.
      return { ok: false, reason: "Esa propuesta se acepta de otra forma." };
  }
}

/**
 * Una arista no tiene Server Action de siempre a la que llamar: `createGraphEdge`
 * escribe `origin = 'user'` y la política no admite otra cosa. La puerta es
 * `graph_aceptar_arista` (0062), que comprueba propiedad, estado, visibilidad y
 * frontera en la misma transacción en la que escribe.
 */
async function aceptarArista(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  id: string,
  p: PropuestaSaneada
): Promise<ActionResult & { resuelta?: boolean }> {
  const { data, error } = await supabase.rpc("graph_aceptar_arista", { p_proposal: id });
  if (error) return actionFailed(error);
  // `frontera` y `no_visible` dejan la propuesta en `fallida` DENTRO de
  // `graph_aceptar_arista` (0062): la fila ya no está pendiente en la base,
  // así que `resuelta: true` le dice al rail que la retire de la lista aunque
  // la respuesta no sea `ok` — sin esto, el botón sigue ahí para una propuesta
  // que un segundo clic solo puede volver a fallar igual.
  if (data === "frontera") {
    return {
      ok: false,
      resuelta: true,
      reason: "No se puede: uno de los dos es tuyo y el otro vive en un espacio compartido."
    };
  }
  if (data === "no_visible") {
    return { ok: false, resuelta: true, reason: "Uno de los dos ya no existe o ya no lo ves." };
  }

  await supabase.from("audit_log").insert({
    user_id: userId,
    action: "graph.edge.accept_ai",
    object: id,
    meta: { rel: p.payload.rel }
  });
  revalidatePath("/graph");
  revalidatePath("/home");
  return actionOk;
}

export async function acceptProposal(
  id: string,
  workspaceId: string | null
): Promise<ActionResult & { href?: string; resuelta?: boolean }> {
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

  if (limpia.tipo === "arista") return aceptarArista(supabase, user.id, parsed.data, limpia);

  // EL RECLAMO. Antes se comprobaba `status === 'pending'` y se actualizaba
  // después, y dos clics a la vez pasaban los dos. Ahora la fila cambia a
  // `aplicando` solo si seguía pendiente, y solo quien la cambió sigue.
  const { data: reclamada } = await supabase
    .from("coach_proposals")
    .update({ status: "aplicando" })
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!reclamada) return { ok: false, reason: "Esa propuesta ya se resolvió." };

  let resultado: ActionResult & { href?: string };
  try {
    resultado = await ejecutar(limpia, workspaceId);
  } catch (e) {
    // `upsertRoutine` y `upsertPersonalGoal` lanzan en vez de devolver.
    resultado = { ok: false, reason: e instanceof Error ? e.message : "No se pudo crear." };
  }

  if (!resultado.ok) {
    // Vuelve a pendiente: el botón se puede pulsar otra vez. Solo si sigue en
    // `aplicando` — si alguien la descartó en otra pestaña mientras tanto, no
    // se resucita lo que ya se descartó.
    await supabase
      .from("coach_proposals")
      .update({ status: "pending" })
      .eq("id", parsed.data)
      .eq("user_id", user.id)
      .eq("status", "aplicando");
    return resultado;
  }

  // Mismo resguardo: solo se marca aceptada la fila que este reclamo dejó en
  // `aplicando`, nunca una que otra pestaña ya movió a `dismissed`.
  const { error } = await supabase
    .from("coach_proposals")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .eq("status", "aplicando");
  if (error) return actionFailed(error);

  revalidatePath("/home");
  return resultado;
}

export async function dismissProposal(id: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, reason: "Esa propuesta no existe." };

  const { supabase, user } = await requireUser();
  // Solo desde `pending` o `fallida`: sin este filtro, una pestaña vieja podía
  // descartar una propuesta que otra pestaña acaba de aceptar (`accepted`) o
  // que `acceptProposal` tiene reclamada en `aplicando` a mitad de escribir.
  const { error } = await supabase
    .from("coach_proposals")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .in("status", ["pending", "fallida"]);
  if (error) return actionFailed(error);

  revalidatePath("/home");
  return actionOk;
}
