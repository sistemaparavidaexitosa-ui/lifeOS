"use client";

import { useEffect, useState } from "react";
import type { ContenidoDelRitual } from "@/lib/data/ritual";
import RitualOverlay from "./RitualOverlay";

export interface DatosDelRitual {
  contenido: ContenidoDelRitual;
  blocking: boolean;
  currency: string;
  locale: string;
}

/**
 * El anfitrión del overlay: un componente cliente que la puerta pinta SIEMPRE,
 * con datos o con `null`.
 *
 * EXISTE POR UN FALLO QUE ENCONTRÓ LA PRUEBA DE NAVEGADOR. Marcar un hábito
 * dentro del ritual llama a `toggleHabitToday`, que revalida la pantalla; el
 * layout se vuelve a pintar, la puerta pregunta otra vez «¿se muestra?», ve la
 * fila de `ritual_runs` que el propio overlay escribió al montar, contesta «ya
 * visto» y devuelve `null`. Resultado: el ritual desaparecía en cuanto la
 * persona hacía lo que el ritual le pedía.
 *
 * La puerta sigue teniendo razón —si recargas, no debe volver a salir—, pero
 * esa respuesta vale para montar, no para desmontar. Así que la decisión se
 * ENGANCHA aquí: el primer contenido que llega se queda, y un `null` posterior
 * no cierra nada. React conserva el estado de un componente cliente a través de
 * una revalidación siempre que siga en el mismo sitio del árbol, y por eso la
 * puerta pinta este anfitrión también cuando no hay nada que mostrar.
 *
 * Lo único que cierra el ritual es la persona: Escape, «Ahora no» o terminarlo.
 */
export default function RitualHost({ datos }: { datos: DatosDelRitual | null }) {
  const [enganchado, setEnganchado] = useState<DatosDelRitual | null>(datos);

  useEffect(() => {
    // Solo engancha: un `null` que llega después no suelta lo que ya se mostró.
    if (!enganchado && datos) setEnganchado(datos);
  }, [datos, enganchado]);

  if (!enganchado) return null;

  return (
    <RitualOverlay
      entrada={enganchado.contenido}
      blocking={enganchado.blocking}
      identidadDeclarada={enganchado.contenido.identidadDeclarada}
      hayBriefDeHoy={enganchado.contenido.hayBriefDeHoy}
      briefIntentadoHoy={enganchado.contenido.briefIntentadoHoy}
      currency={enganchado.currency}
      locale={enganchado.locale}
    />
  );
}
