import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireVapidKeys } from "@/config/env";
import { encryptPushPayload } from "@/lib/domain/push/encrypt.ts";
import { vapidAuthorization } from "@/lib/domain/push/vapid.ts";

/**
 * Entrega de notificaciones push a los dispositivos de una persona.
 *
 * REGLA DE ORO DE ESTE MÓDULO: **nunca lanza**. Es el mismo contrato de
 * `src/lib/email/send.ts` (D-021) y por la misma razón: esto se llama al final
 * de acciones que YA hicieron su trabajo —escribir un comentario, asignar una
 * tarea— y que APNs esté caído no puede convertir un comentario guardado en un
 * error en pantalla. Devuelve siempre un resultado; nadie está obligado a
 * mirarlo, pero está.
 *
 * POR QUÉ USA `service_role`
 * Para avisarte a TI hay que leer TUS suscripciones, y quien provoca el aviso
 * es otra persona. La RLS de `push_subscriptions` no deja ver las ajenas a
 * propósito —`endpoint` + `p256dh` + `auth` es material suficiente para
 * empujarle notificaciones a cualquiera—, así que no hay forma de hacer esto
 * con la sesión de quien escribe. Tampoco sirve un `security definer`: sería
 * exactamente esa exposición con otro nombre. Ver el comentario ampliado en
 * `src/lib/supabase/admin.ts`.
 */

export interface PushPayload {
  title: string;
  body: string;
  href: string;
  /** Va como `tag` de la notificación: un segundo aviso del mismo hilo reemplaza al primero. */
  dedupeKey: string;
}

export interface PushResult {
  /** Dispositivos a los que llegó. */
  sent: number;
  /** Dispositivos que fallaron y siguen vivos (los muertos se borran, no se cuentan). */
  failed: number;
  /** Motivo legible cuando no salió ninguno. */
  reason?: string;
}

/**
 * Tope de cuerpo de los servicios de push. El límite real ronda los 4 KB del
 * mensaje cifrado; se recorta bastante antes porque la cabecera son 86 octetos,
 * el cifrado añade 17 y una notificación de 3 KB no la lee nadie.
 */
const MAX_BODY = 800;

export async function sendPush(userId: string, payload: PushPayload): Promise<PushResult> {
  let credentials;
  try {
    credentials = requireVapidKeys();
  } catch (e) {
    // Sin llaves configuradas no es un fallo: es que esta instalación no tiene
    // notificaciones. La app entera funciona igual.
    return { sent: 0, failed: 0, reason: e instanceof Error ? e.message : "VAPID no configurado" };
  }

  try {
    const supabase = createAdminClient();
    const { data: suscripciones, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, failure_count")
      .eq("user_id", userId);

    if (error) return { sent: 0, failed: 0, reason: error.message };
    if (!suscripciones?.length) return { sent: 0, failed: 0, reason: "Sin dispositivos suscritos" };

    const cuerpo = JSON.stringify({
      title: payload.title,
      body: payload.body.slice(0, MAX_BODY),
      href: payload.href,
      dedupeKey: payload.dedupeKey
    });

    let sent = 0;
    let failed = 0;

    // En serie y no en paralelo: son uno o dos dispositivos por persona, y en
    // paralelo un 429 de FCM se multiplicaría por el número de dispositivos.
    for (const s of suscripciones) {
      const resultado = await entregar(s, cuerpo, credentials);
      if (resultado === "ok") {
        sent++;
        // El contador se reinicia al primer acierto: si no, un dispositivo que
        // tuvo un mal día arrastraría el número para siempre y parecería roto.
        if (s.failure_count > 0) {
          await supabase.from("push_subscriptions").update({ failure_count: 0 }).eq("id", s.id);
        }
      } else {
        failed++;
        if (resultado === "muerta") {
          // 404/410: el navegador ya no conoce esa suscripción. Borrarla es lo
          // correcto, no marcarla: reintentarla no va a funcionar nunca más.
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          // Fallo blando (429, 5xx, red): no se borra —la suscripción sigue
          // siendo válida— pero se cuenta, para poder distinguir un tropiezo
          // de un dispositivo que lleva semanas sin aceptar nada.
          await supabase
            .from("push_subscriptions")
            .update({ failure_count: s.failure_count + 1 })
            .eq("id", s.id);
        }
      }
    }

    return { sent, failed, reason: sent === 0 ? "Ningún dispositivo aceptó el envío" : undefined };
  } catch (e) {
    return { sent: 0, failed: 0, reason: e instanceof Error ? e.message : "Error inesperado al enviar el push" };
  }
}

type Entrega = "ok" | "muerta" | "fallo";

async function entregar(
  s: { endpoint: string; p256dh: string; auth: string },
  cuerpo: string,
  credentials: ReturnType<typeof requireVapidKeys>
): Promise<Entrega> {
  try {
    const cifrado = await encryptPushPayload(cuerpo, { p256dh: s.p256dh, auth: s.auth });
    const authorization = await vapidAuthorization(s.endpoint, credentials);

    const respuesta = await fetch(s.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        // Un día de vida. Si el teléfono está apagado más que eso, el aviso ya
        // no es un aviso.
        TTL: "86400",
        // `high` es lo que pide que se entregue aunque el teléfono esté en
        // reposo. No lo garantiza —el modo Doze de Android manda— pero sin
        // ella el retraso es la norma.
        Urgency: "high"
      },
      body: cifrado as unknown as BodyInit
    });

    if (respuesta.status === 404 || respuesta.status === 410) return "muerta";
    return respuesta.ok ? "ok" : "fallo";
  } catch {
    return "fallo";
  }
}
