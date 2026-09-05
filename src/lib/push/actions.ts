"use server";

import { createClient } from "@/lib/supabase/server";
import { sendPush } from "./send";

/**
 * Alta, baja y prueba de un dispositivo suscrito.
 *
 * Todas devuelven un resultado en vez de lanzar, y quien llama DEBE mostrarlo:
 * «notificaciones activadas» cuando en realidad no se guardó la suscripción es
 * exactamente la mentira que hace que alguien se pierda un aviso y no sepa por
 * qué. Mismo criterio que `sendEmail` con las invitaciones (D-021).
 */

export interface PushActionResult {
  ok: boolean;
  reason?: string;
}

/** Lo que devuelve `subscription.toJSON()` en el navegador. */
export interface SubscriptionJson {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function savePushSubscription(
  subscription: SubscriptionJson,
  userAgent?: string
): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, reason: "El navegador devolvió una suscripción incompleta." };
  }

  // `upsert` sobre `endpoint`, que es único GLOBAL (0049): así este navegador
  // no puede acabar con dos filas y el aviso de una persona en la pantalla de
  // otra. Reactivar en la misma cuenta pasa por aquí y solo refresca la fila.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent?.slice(0, 300) ?? null,
      last_seen_at: new Date().toISOString(),
      failure_count: 0
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    // El caso del teléfono compartido: otra cuenta registró ESTE navegador y la
    // RLS no deja pisar su fila. El error de Postgres («new row violates
    // row-level security policy») no le dice nada a nadie, así que se traduce.
    const chocaConOtraCuenta = error.code === "42501" || error.code === "23505";
    return {
      ok: false,
      reason: chocaConOtraCuenta
        ? "Este navegador ya recibe avisos de otra cuenta. Entra con ella y desactívalos ahí antes de activarlos aquí."
        : error.message
    };
  }
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  // El `eq("user_id")` es redundante con la RLS y va igualmente: la política
  // es la cerradura, esto es la intención escrita.
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Manda una notificación de prueba a los dispositivos propios.
 *
 * Es la única forma honesta de comprobar que la cadena entera funciona —
 * permiso, service worker, VAPID, cifrado y el servicio de push— sin necesitar
 * a otra persona que te mencione.
 */
export async function sendTestPush(): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const resultado = await sendPush(user.id, {
    title: "Life OS",
    body: "Si estás leyendo esto en el teléfono, las notificaciones funcionan.",
    href: "/home",
    dedupeKey: `prueba:${Date.now()}`
  });

  if (resultado.sent > 0) return { ok: true };
  return { ok: false, reason: resultado.reason ?? "No se pudo entregar a ningún dispositivo." };
}
