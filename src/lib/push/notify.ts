import "server-only";

import { createClient } from "@/lib/supabase/server";
import { sendPush } from "./send";

/**
 * Avisar a alguien: deja el aviso en su bandeja y, si tiene el teléfono
 * suscrito, se lo hace sonar.
 *
 * ES LA ÚNICA PUERTA. Los cuatro disparadores —mención, asignación,
 * recordatorio y vencimiento— pasan por aquí, para que la idempotencia y el
 * contrato de errores se decidan en un solo sitio.
 *
 * NUNCA LANZA, igual que `sendEmail` (D-021), `recordActivity` y
 * `dispatchAutomations`. Se invoca al final de acciones que ya terminaron su
 * trabajo: escribir un comentario tiene que funcionar aunque el push falle.
 * Por eso el `try` envuelve TODO, incluida la inserción en la bandeja.
 */

export type NotificationKind = "mention" | "task.assigned" | "reminder" | "task.due";

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** A dónde lleva el aviso, ya armado. */
  href: string;
  /**
   * Idempotencia. `mention:<comment_id>`, `assign:<task_id>:<fecha_local>`,
   * `reminder:<reminder_id>`, `due:<fecha_local>`. Si ya existe, no se crea
   * nada Y NO SE REENVÍA el push: es lo que evita que reguardar algo vuelva a
   * sonar.
   */
  dedupeKey: string;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const supabase = await createClient();

    // `enqueue_notification` es `security definer` y comprueba que quien llama
    // comparte espacio con el destinatario (0049). No se inserta directamente
    // porque `notifications` no tiene política de INSERT: la bandeja de otro no
    // puede ser un buzón abierto.
    const { data: id, error } = await supabase.rpc("enqueue_notification", {
      p_user_id: input.userId,
      p_kind: input.kind,
      p_title: input.title,
      p_body: input.body,
      p_href: input.href,
      p_dedupe_key: input.dedupeKey
    });

    if (error) return;
    // NULL = esa dedupe_key ya existía. No es un error: es que ese aviso ya se
    // dio, y repetir el push sería despertar a alguien dos veces por lo mismo.
    if (!id) return;

    const resultado = await sendPush(input.userId, {
      title: input.title,
      body: input.body,
      href: input.href,
      dedupeKey: input.dedupeKey
    });

    // `delivered_at` marca que el push SALIÓ, no que se haya visto. Lo escribe
    // el despachador con service_role cuando reintenta; aquí se hace con la
    // sesión de quien provocó el aviso, que no puede tocar la fila de otro —
    // así que la marca la pone el propio RPC de arriba solo cuando toca.
    if (resultado.sent > 0) await marcarEntregado(id as string);
  } catch {
    // Ver el contrato de arriba: un aviso roto no rompe la acción que lo
    // provocó.
  }
}

/**
 * Marca la notificación como entregada. Necesita saltarse la RLS porque quien
 * está en la sesión es el AUTOR del comentario, no el destinatario, y
 * `notifications_update` solo deja tocar las propias.
 */
async function marcarEntregado(id: string): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient()
      .from("notifications")
      .update({ delivered_at: new Date().toISOString(), delivery_attempts: 1 })
      .eq("id", id);
  } catch {
    // Que no quede marcada solo significa que el despachador la mirará otra
    // vez; el `dedupe_key` impide que eso se convierta en un segundo aviso.
  }
}

/**
 * La misma idea que `notify`, pero desde el reloj: sin sesión.
 *
 * `enqueue_notification` no sirve aquí porque comprueba `auth.uid()`, y quien
 * llama es pg_cron a través de /api/push/dispatch, donde no hay usuario. Se
 * inserta con `service_role`, que es la única forma de escribir en la bandeja
 * sin ser nadie — por eso vive en el Route Handler y no en una Server Action.
 *
 * `ignoreDuplicates` sobre `(user_id, dedupe_key)` hace el mismo papel que el
 * `on conflict do nothing` del RPC: el reloj pasa cada cinco minutos y ve lo
 * mismo una y otra vez.
 *
 * Devuelve si CREÓ el aviso, no si logró entregarlo. Son dos cosas distintas y
 * confundirlas hace mentir al recuento del despachador: sin ningún dispositivo
 * suscrito, un resumen de vencimientos que sí entró en la bandeja se reportaba
 * como cero. La entrega tiene su propio camino (`reintentarPendientes`).
 */
export async function notifySystem(input: NotifyInput): Promise<boolean> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("notifications")
      .upsert(
        {
          user_id: input.userId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          href: input.href,
          dedupe_key: input.dedupeKey
        },
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }
      )
      .select("id");

    if (error) return false;
    // Vacío = ya existía. Ese aviso ya se dio; repetirlo sería despertar a
    // alguien dos veces por lo mismo.
    const creado = data?.[0]?.id;
    if (!creado) return false;

    const resultado = await sendPush(input.userId, {
      title: input.title,
      body: input.body,
      href: input.href,
      dedupeKey: input.dedupeKey
    });

    await supabase
      .from("notifications")
      .update({
        delivered_at: resultado.sent > 0 ? new Date().toISOString() : null,
        delivery_attempts: 1
      })
      .eq("id", creado);

    return true;
  } catch {
    return false;
  }
}
