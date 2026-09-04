// src/lib/push/client.ts
// Lo que ocurre en el NAVEGADOR para activar las notificaciones. Sin "use
// server" y sin `server-only`: esto corre en el cliente y lo usan tanto el
// registro silencioso del layout como el botón de Configuración.

import { fromBase64Url } from "@/lib/domain/push/base64url.ts";
import { deletePushSubscription, savePushSubscription } from "./actions";

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

export async function estadoPush(): Promise<EstadoPush> {
  if (!soportaPush()) return esIosSinInstalar() ? "ios-sin-instalar" : "no-soportado";
  if (esIosSinInstalar()) return "ios-sin-instalar";
  if (Notification.permission === "denied") return "bloqueado";

  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager.getSubscription();
  return suscripcion ? "activo" : "disponible";
}

/**
 * Pide permiso y suscribe. **Tiene que llamarse desde un gesto del usuario**:
 * iOS rechaza `requestPermission()` fuera de un clic.
 */
export async function activarPush(): Promise<{ ok: boolean; reason?: string }> {
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

export async function desactivarPush(): Promise<{ ok: boolean; reason?: string }> {
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
    if (suscripcion) {
      await savePushSubscription(suscripcion.toJSON() as never, navigator.userAgent);
    }
  } catch {
    /* Silencioso a propósito: es mantenimiento, no una acción del usuario. */
  }
}
