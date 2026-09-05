import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireVapidKeys } from "@/config/env";
import { encryptPushPayload } from "@/lib/domain/push/encrypt.ts";
import { isVapidPair, vapidAuthorization } from "@/lib/domain/push/vapid.ts";

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

    // Antes de gastar una petición por dispositivo: si las llaves no casan
    // entre sí, TODAS van a fallar con el mismo 401 y el motivo no estaría en
    // la respuesta de nadie. Se comprueba aquí para no mandar a desactivar y
    // reactivar el teléfono —que es el otro arreglo posible del mismo código
    // de estado— cuando el problema está en las variables de entorno.
    if (!(await isVapidPair(credentials.privateJwk, credentials.publicKey))) {
      return {
        sent: 0,
        failed: 0,
        reason:
          "VAPID_PRIVATE_JWK y NEXT_PUBLIC_VAPID_PUBLIC_KEY no son pareja: son mitades de pares distintos. Vuelven a generarse juntas con `node scripts/generate-vapid.mjs` y hay que actualizar LAS DOS."
      };
    }

    const cuerpo = JSON.stringify({
      title: payload.title,
      body: payload.body.slice(0, MAX_BODY),
      href: payload.href,
      dedupeKey: payload.dedupeKey
    });

    let sent = 0;
    let failed = 0;
    const motivos: string[] = [];

    // En serie y no en paralelo: son uno o dos dispositivos por persona, y en
    // paralelo un 429 de FCM se multiplicaría por el número de dispositivos.
    for (const s of suscripciones) {
      const resultado = await entregar(s, cuerpo, credentials);
      if (resultado.estado === "fallo") motivos.push(resultado.detalle);
      if (resultado.estado === "ok") {
        sent++;
        // El contador se reinicia al primer acierto: si no, un dispositivo que
        // tuvo un mal día arrastraría el número para siempre y parecería roto.
        if (s.failure_count > 0) {
          await supabase.from("push_subscriptions").update({ failure_count: 0 }).eq("id", s.id);
        }
      } else {
        failed++;
        if (resultado.estado === "muerta") {
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

    return {
      sent,
      failed,
      // Con el motivo del proveedor delante. Sin esto, «ningún dispositivo
      // aceptó el envío» obligaba a adivinar entre una firma inválida, una
      // suscripción caducada y un fallo de red.
      reason: sent === 0 ? (motivos[0] ?? "Ningún dispositivo aceptó el envío") : undefined
    };
  } catch (e) {
    return { sent: 0, failed: 0, reason: e instanceof Error ? e.message : "Error inesperado al enviar el push" };
  }
}

/**
 * `detalle` existe porque sin él esto era indiagnosticable: la interfaz decía
 * «ningún dispositivo aceptó el envío» y ahí se acababa la información. Es el
 * mismo criterio de `sendEmail`, que propaga el cuerpo del error del proveedor
 * tal cual — un «no se pudo» a secas no le sirve a nadie (D-021).
 */
type Entrega = { estado: "ok" | "muerta" } | { estado: "fallo"; detalle: string };

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

    if (respuesta.status === 404 || respuesta.status === 410) return { estado: "muerta" };
    if (respuesta.ok) return { estado: "ok" };

    // El cuerpo trae el motivo real de FCM o APNs. Se recorta pero no se
    // esconde: es lo único que distingue «la firma no vale» de «el servicio
    // está saturado».
    const cuerpoError = await respuesta.text().catch(() => "");
    const proveedor = new URL(s.endpoint).host;

    // 401/403 tiene una causa dominante y una salida concreta, así que se
    // nombra en vez de dejar el código desnudo: el navegador se suscribió
    // anunciando una clave pública, y si la privada configurada no es su
    // pareja, la firma no valida. Cambiar las llaves NO revoca las
    // suscripciones viejas: siguen ahí, atadas a la clave anterior.
    const pista =
      respuesta.status === 401 || respuesta.status === 403
        ? " — la firma VAPID no valida: la suscripción de este dispositivo se creó con OTRA clave pública. Desactiva y vuelve a activar las notificaciones en él."
        : "";

    return {
      estado: "fallo",
      detalle: `${proveedor} respondió ${respuesta.status}${pista} ${cuerpoError.slice(0, 200)}`.trim()
    };
  } catch (e) {
    return { estado: "fallo", detalle: e instanceof Error ? e.message : "Error de red al empujar" };
  }
}
