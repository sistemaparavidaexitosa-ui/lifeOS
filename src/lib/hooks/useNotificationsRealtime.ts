"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Avisa cuando entra algo en la bandeja de quien mira.
 *
 * POR QUÉ EXISTE
 * La campana se pinta en el servidor y solo se recalcula al navegar. Con la
 * app abierta y quieta —que es justo lo que pasa mientras trabajas— alguien te
 * menciona, el teléfono suena, y la pestaña que tienes delante sigue diciendo
 * cero. Eso hace que la insignia parezca rota aunque el aviso haya llegado.
 *
 * NO trae el dato del evento: solo dispara `onChange`, que en la práctica es
 * `router.refresh()`. Reconstruir la fila desde el payload significaría
 * mantener DOS maneras de armar la misma lista.
 *
 * No hace falta filtrar por usuario: Realtime aplica la RLS del suscriptor y
 * `notifications_select` solo deja ver las propias (0049).
 */
export function useNotificationsRealtime(onChange: () => void) {
  // El callback en una ref: si entrara como dependencia del efecto, cada
  // render de la campana cerraría el canal y abriría otro.
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications")
      // Solo INSERT: un UPDATE es marcar leído, y eso ya lo provocó quien mira.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () =>
        callback.current()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
}
