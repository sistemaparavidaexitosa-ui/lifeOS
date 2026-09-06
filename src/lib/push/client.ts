// src/lib/push/client.ts
// Lo que ocurre en el NAVEGADOR para activar las notificaciones. Sin "use
// server" y sin `server-only`: esto corre en el cliente y lo usan tanto el
// registro silencioso del layout como el botón de Configuración.

import { fromBase64Url, toBase64Url } from "@/lib/domain/push/base64url.ts";
import { deletePushSubscription, savePushSubscription } from "./actions";
import type { ActionResult } from "@/lib/supabase/errors";

export type EstadoPush =
  /** El navegador no sabe de service workers ni de push. */
  | "no-soportado"
  /** iPhone en Safari, sin instalar: iOS NO entrega push aquí, haga lo que haga. */
  | "ios-sin-instalar"
  /** Se puede activar; falta pedir el permiso. */
  | "disponible"
  /** Activado y con suscripción guardada. */
  | "activo"
  /** El usuario dijo que no. Solo se deshace desde los ajustes del navegador. */
  | "bloqueado";

/**
 * ¿Estamos en un iPhone/iPad que NO está abierto desde la pantalla de inicio?
 *
 * iOS 16.4+ trae Web Push, pero SOLO para apps añadidas a la pantalla de
 * inicio. En Safari normal, `Notification.requestPermission()` existe y falla,
 * así que hay que detectarlo ANTES de ofrecer un botón: enseñar un botón que
 * no puede funcionar es peor que explicar el paso que falta.
 */
export function esIosSinInstalar(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  // El iPad moderno se hace pasar por Mac; `maxTouchPoints` lo delata.
  const esIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!esIos) return false;

  const instalada =
    ("standalone" in navigator && (navigator as unknown as { standalone?: boolean }).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches;
  return !instalada;
}

export function soportaPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!soportaPush()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // Lo más probable es una CSP sin `worker-src` (ver src/middleware.ts) o un
    // origen sin HTTPS. No hay nada que el usuario pueda hacer, así que no se
    // le cuenta: el estado se quedará en "disponible" y el botón fallará con
    // un motivo.
    return null;
  }
}

/**
 * ¿Esta suscripción se creó con la clave pública que usamos AHORA?
 *
 * Una suscripción queda atada para siempre a la `applicationServerKey` con la
 * que nació. Si las llaves del servidor cambian, la vieja no se invalida sola:
 * sigue existiendo en el navegador, sigue pareciendo buena, y el servicio de
 * push rechaza cada envío —Apple con un 403 `BadJwtToken`— porque la firma no
 * corresponde a la clave que anunció aquel día.
 *
 * Peor aún: la especificación hace que `subscribe()` FALLE con
 * `InvalidStateError` si ya hay una suscripción con otra clave. Sin detectar
 * esto, rotar las llaves dejaba la app en un callejón del que solo se salía
 * borrando los datos del sitio a mano.
 */
function creadaConLaClaveActual(suscripcion: PushSubscription, esperada: string): boolean {
  const enUso = suscripcion.options?.applicationServerKey;
  if (!enUso) return false;
  try {
    return toBase64Url(new Uint8Array(enUso)) === esperada;
  } catch {
    return false;
  }
}

/**
 * Suelta una suscripción que ya no sirve, en el navegador y en el servidor.
 * Silenciosa a propósito: es limpieza, no una acción del usuario.
 */
async function descartar(suscripcion: PushSubscription): Promise<void> {
  const endpoint = suscripcion.endpoint;
  try {
    await suscripcion.unsubscribe();
  } catch {
    /* Da igual: lo que importa es no volver a ofrecerla como válida. */
  }
  try {
    await deletePushSubscription(endpoint);
  } catch {
    /* La fila huérfana la limpiará el primer 410 del servicio de push. */
  }
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!soportaPush()) return esIosSinInstalar() ? "ios-sin-instalar" : "no-soportado";
  if (esIosSinInstalar()) return "ios-sin-instalar";
  if (Notification.permission === "denied") return "bloqueado";

  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager.getSubscription();
  if (!suscripcion) return "disponible";

  // Una suscripción atada a una clave anterior NO está activa por mucho que
  // exista: cada envío se rechaza. Decir «activo» ahí era mentir al usuario y
  // esconderle el único botón que lo arregla.
  const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (clave && !creadaConLaClaveActual(suscripcion, clave)) return "disponible";

  return "activo";
}

/**
 * Pide permiso y suscribe. **Tiene que llamarse desde un gesto del usuario**:
 * iOS rechaza `requestPermission()` fuera de un clic.
 */
export async function activarPush(): Promise<ActionResult> {
  if (!soportaPush()) return { ok: false, reason: "Este navegador no admite notificaciones." };
  if (esIosSinInstalar()) {
    return {
      ok: false,
      reason: "En iPhone hay que añadir Life OS a la pantalla de inicio antes de poder activar las notificaciones."
    };
  }

  const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!clave) return { ok: false, reason: "Esta instalación no tiene configuradas las llaves de notificaciones." };

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    return { ok: false, reason: "Sin permiso del navegador no se puede avisar de nada." };
  }

  const registro = (await navigator.serviceWorker.getRegistration()) ?? (await registrarServiceWorker());
  if (!registro) return { ok: false, reason: "No se pudo registrar el service worker." };
  // `ready` y no el registro a secas: recién instalado todavía no está activo,
  // y suscribirse contra uno que aún no controla la página falla.
  await navigator.serviceWorker.ready;

  // Soltar primero cualquier suscripción de una clave anterior. Sin esto,
  // `subscribe()` lanza `InvalidStateError` en vez de reemplazarla, y el
  // usuario se queda sin forma de reactivar desde la interfaz.
  const existente = await registro.pushManager.getSubscription();
  if (existente && !creadaConLaClaveActual(existente, clave)) {
    await descartar(existente);
  }

  try {
    const suscripcion = await registro.pushManager.subscribe({
      // Obligatorio en Chrome y de facto en Safari: promete que cada push
      // acabará en una notificación visible. El service worker lo cumple
      // siempre, incluso con un aviso genérico (ver public/sw.js).
      userVisibleOnly: true,
      applicationServerKey: fromBase64Url(clave) as BufferSource
    });

    return await savePushSubscription(suscripcion.toJSON() as never, navigator.userAgent);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "El navegador rechazó la suscripción." };
  }
}

export async function desactivarPush(): Promise<ActionResult> {
  try {
    const registro = await navigator.serviceWorker.getRegistration();
    const suscripcion = await registro?.pushManager.getSubscription();
    if (!suscripcion) return { ok: true };

    const endpoint = suscripcion.endpoint;
    await suscripcion.unsubscribe();
    return await deletePushSubscription(endpoint);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "No se pudo desactivar." };
  }
}

/**
 * Revalidación de arranque.
 *
 * Las suscripciones caducan solas: el navegador las invalida tras una
 * actualización, una limpieza de datos o semanas de inactividad, y
 * `pushsubscriptionchange` solo lo avisa a veces (Safari lo implementa a
 * medias). Así que en cada carga de la app se vuelve a guardar la que haya —o
 * se borra la que ya no exista—, que es la única red que no depende del
 * navegador.
 */
export async function revalidarSuscripcion(): Promise<void> {
  if (!soportaPush() || Notification.permission !== "granted") return;
  try {
    const registro = (await navigator.serviceWorker.getRegistration()) ?? (await registrarServiceWorker());
    if (!registro) return;
    const suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) return;

    // Si nació con otra clave, se descarta en vez de refrescarla. Antes se
    // volvía a guardar en cada carga, así que la fila muerta se mantenía viva
    // sola y el servidor seguía empujando contra ella para siempre.
    const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (clave && !creadaConLaClaveActual(suscripcion, clave)) {
      await descartar(suscripcion);
      return;
    }

    await savePushSubscription(suscripcion.toJSON() as never, navigator.userAgent);
  } catch {
    /* Silencioso a propósito: es mantenimiento, no una acción del usuario. */
  }
}
