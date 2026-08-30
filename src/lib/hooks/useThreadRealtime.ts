"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Avisa cuando el hilo de una tarea cambia en el servidor.
 *
 * POR QUÉ EXISTE
 * El drawer carga el hilo una vez y lo vuelve a pedir tras cada acción PROPIA.
 * Lo del compañero no llegaba nunca: si dos personas miran la misma tarea, una
 * comenta y la otra no se entera hasta que recarga. Eso es lo que separa «se
 * siente como un chat» de «se siente como un formulario».
 *
 * Se suscribe a `comments` y a `comment_reactions`, las dos únicas tablas de la
 * publicación (migración 0039). Realtime aplica la RLS del suscriptor, así que
 * esto no puede filtrar un comentario de un proyecto ajeno.
 *
 * Y NO trae el dato del evento: solo dispara `onChange`, que vuelve a pedir el
 * hilo entero por el camino de siempre. Reconstruir el estado desde el payload
 * significaría mantener DOS maneras de armar el mismo hilo, y la del evento no
 * tiene ni el nombre del autor ni el roster para pintar las menciones.
 */
export function useThreadRealtime(taskId: string | null, onChange: () => void) {
  // El callback en una ref: si entrara como dependencia del efecto, cada render
  // del panel cerraría el canal y abriría otro.
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (!taskId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`thread:${taskId}`)
      .on(
        "postgres_changes",
        // El filtro va en el servidor: sin él, cualquier comentario de
        // cualquier tarea despertaría este drawer.
        { event: "*", schema: "public", table: "comments", filter: `subject_id=eq.${taskId}` },
        () => callback.current()
      )
      // Las reacciones no tienen `subject_id`, así que no se pueden filtrar por
      // tarea desde el servidor: llegan las de todos los comentarios visibles y
      // se recarga igual. Es una recarga de más en un hilo ajeno, no un error.
      .on("postgres_changes", { event: "*", schema: "public", table: "comment_reactions" }, () => callback.current())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [taskId]);
}
