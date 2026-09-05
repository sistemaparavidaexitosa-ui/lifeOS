// public/sw.js — el service worker de Life OS.
//
// Vive en la RAÍZ del sitio a propósito: el scope de un service worker es la
// carpeta desde la que se sirve, así que en `/api/push/sw.js` solo controlaría
// `/api/push/` y no recibiría nada.
//
// ESTE ARCHIVO NO CACHEA NADA, Y ES DELIBERADO.
// Un service worker con caché de assets es la forma más rápida de servir un
// bundle viejo en producción y pasarse una tarde sin entender por qué el
// despliegue "no sube". Aquí solo hay notificaciones. Si algún día hace falta
// modo offline, es una decisión aparte y con su propia estrategia de versiones.
//
// No pasa por el compilador de Next: es JavaScript plano servido tal cual
// desde `public/`.

const ICONO = "/icons/icon-192.png";
const BADGE = "/icons/badge-72.png";

/**
 * Llega un push.
 *
 * REGLA DURA: este manejador SIEMPRE tiene que terminar mostrando una
 * notificación. La suscripción se pidió con `userVisibleOnly: true`, y si el
 * evento acaba sin `showNotification` el navegador enseña por su cuenta
 * «Este sitio se ha actualizado en segundo plano» — y si se repite, revoca la
 * suscripción y dejan de llegar avisos para siempre. Por eso hay tres niveles
 * de red por debajo: el payload, la bandeja y un texto genérico.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(mostrar(event));
});

async function mostrar(event) {
  let aviso = null;

  // 1) Lo normal: el contenido viene cifrado dentro del propio push (RFC 8291),
  //    así que ni FCM ni APNs lo han podido leer.
  try {
    if (event.data) aviso = event.data.json();
  } catch {
    aviso = null;
  }

  // 2) Red de seguridad, para un push sin cuerpo o con un cuerpo ilegible.
  if (!aviso) {
    try {
      const r = await fetch("/api/push/pending", { credentials: "include" });
      if (r.ok) {
        const pendientes = await r.json();
        aviso = pendientes?.notifications?.[0] ?? null;
      }
    } catch {
      aviso = null;
    }
  }

  // 3) Lo último antes de que el navegador hable por nosotros.
  if (!aviso) {
    aviso = { title: "Life OS", body: "Tienes un aviso nuevo.", href: "/home", dedupeKey: "generico" };
  }

  return self.registration.showNotification(aviso.title || "Life OS", {
    body: aviso.body || "",
    icon: ICONO,
    badge: BADGE,
    // `tag` + `renotify`: un segundo aviso del MISMO hilo reemplaza al anterior
    // en vez de amontonarse, pero vuelve a sonar. Sin `renotify` sustituiría el
    // texto en silencio y no te enterarías de la respuesta.
    tag: aviso.dedupeKey || "lifeos",
    renotify: true,
    // Solo Android lo respeta; Safari lo ignora sin quejarse.
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data: { href: aviso.href || "/home" }
  });
}

/**
 * Toque en la notificación.
 *
 * Si ya hay una ventana de la app abierta se reutiliza en vez de abrir otra:
 * abrir una segunda pestaña de algo que ya tienes delante es de las cosas que
 * más molestan de una notificación.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = event.notification.data?.href || "/home";

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const ventana of ventanas) {
        if ("focus" in ventana) {
          await ventana.focus();
          // `navigate` puede fallar si la ventana está en otro origen o el
          // navegador no lo permite; en ese caso al menos queda enfocada.
          try {
            await ventana.navigate(destino);
          } catch {
            /* enfocada es suficiente */
          }
          return;
        }
      }
      await self.clients.openWindow(destino);
    })()
  );
});

/**
 * El navegador rotó la suscripción por su cuenta (pasa tras una actualización
 * o una limpieza). Se intenta rehacerla en el acto.
 *
 * Safari implementa este evento a medias, así que NO es la red principal: la
 * de verdad es que la app revalida su suscripción en cada arranque
 * (src/components/PushSetup.tsx). Esto solo ahorra la ventana entre medias.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const anterior = event.oldSubscription || (await self.registration.pushManager.getSubscription());
        if (!anterior?.options?.applicationServerKey) return;

        const nueva = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: anterior.options.applicationServerKey
        });

        await fetch("/api/push/resubscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anterior: anterior.endpoint, nueva: nueva.toJSON() })
        });
      } catch {
        /* Sin sesión o sin red: lo arregla el próximo arranque de la app. */
      }
    })()
  );
});
