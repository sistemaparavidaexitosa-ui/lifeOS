"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Avisa cuando un hilo cambia en el servidor.
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
 * El sujeto es un id de TAREA o de PROYECTO, indistintamente: `comments` es
 * polimórfica (subject_type + subject_id) y el filtro va contra subject_id, así
 * que el hilo del proyecto hereda el tiempo real sin una línea nueva. El
 * parámetro se llamaba `taskId` cuando solo existía un hilo; el nombre mentía.
 *
 * Y NO trae el dato del evento: solo dispara `onChange`, que vuelve a pedir el
 * hilo entero por el camino de siempre. Reconstruir el estado desde el payload
 * significaría mantener DOS maneras de armar el mismo hilo, y la del evento no
 * tiene ni el nombre del autor ni el roster para pintar las menciones.
 */
export function useThreadRealtime(subjectId: string | null, onChange: () => void) {
  // El callback en una ref: si entrara como dependencia del efecto, cada render
  // del panel cerraría el canal y abriría otro.
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (!subjectId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`thread:${subjectId}`)
      .on(
        "postgres_changes",
        // El filtro va en el servidor: sin él, cualquier comentario de
        // cualquier hilo despertaría a este.
        { event: "*", schema: "public", table: "comments", filter: `subject_id=eq.${subjectId}` },
        () => callback.current()
      )
      // Las reacciones no tienen `subject_id`, así que no se pueden filtrar por
      // sujeto desde el servidor: llegan las de todos los comentarios visibles
      // y se recarga igual. Es una recarga de más en un hilo ajeno, no un error.
      .on("postgres_changes", { event: "*", schema: "public", table: "comment_reactions" }, () => callback.current())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [subjectId]);
}
