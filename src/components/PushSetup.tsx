"use client";

import { useEffect } from "react";
import { registrarServiceWorker, revalidarSuscripcion, soportaPush } from "@/lib/push/client";

/**
 * Registra el service worker y revalida la suscripción en cada arranque.
 *
 * NO PINTA NADA y NO PIDE PERMISO. Lo primero porque su trabajo es invisible;
 * lo segundo porque pedir permiso nada más entrar es la forma más rápida de
 * que alguien pulse «Bloquear», y ese «no» solo se deshace desde los ajustes
 * del navegador — una decisión de un segundo que cuesta una semana revertir.
 * El botón vive en Configuración, detrás de un gesto explícito, que además es
 * lo que iOS exige.
 *
 * Lo que sí hace aquí, sin preguntar, es mantenimiento: los navegadores
 * invalidan suscripciones por su cuenta y `pushsubscriptionchange` no es
 * fiable en Safari, así que reafirmar la suscripción en cada carga es la única
 * garantía de que los avisos siguen llegando semanas después.
 */
export default function PushSetup() {
  useEffect(() => {
    if (!soportaPush()) return;
    void (async () => {
      await registrarServiceWorker();
      await revalidarSuscripcion();
    })();
  }, []);

  return null;
}
