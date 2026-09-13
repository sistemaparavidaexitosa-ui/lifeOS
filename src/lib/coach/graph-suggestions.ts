import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { dominioDeTabla } from "@/lib/insights/context";
import { elegirMetas } from "@/lib/ai/suggest-edges";
import {
  agruparSinMeta, candidatosAutorizados, huellaArista, propuestaDeArista, sinPropuestasPrevias,
  MAX_ARISTAS_POR_DIA, type Candidato
} from "@/lib/domain/graph/suggestions.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * LAS SUGERENCIAS DEL GRAFO, UNA VEZ AL DÍA.
 *
 * Corre con el coach de la mañana y sin sesión, así que usa `graph_detectar_de`
 * (solo service_role) con el `userId` que puso el despachador. Lo que llega al
 * modelo pasa antes por `candidatosAutorizados`: un hábito no viaja si el
 * usuario apagó Hábitos, aunque el detector lo haya encontrado.
 *
 * LO QUE YA SE PROPUSO NO VUELVE, Y NO LE CUESTA UNA LLAMADA AL MODELO.
 * `graph_detectar_de` redescubre cada mañana los mismos pares mientras sigan
 * dándose las condiciones (el hábito sigue sin meta, las tareas siguen
 * pareciéndose): sin filtrarlos ANTES de agrupar y de llamar a `elegirMetas`,
 * ocupaban los `MAX_ARISTAS_POR_DIA` slots con basura ya vista y encima
 * pagaban una llamada al modelo por nada, porque el `upsert` de abajo las iba
 * a descartar igual. `sinPropuestasPrevias` (dominio puro) los saca con las
 * huellas ya en `coach_proposals` —cualquier estado, no solo `pending`—, leídas
 * una vez por pasada.
 *
 * El `upsert` con `ignoreDuplicates` sobre `(user_id, fingerprint)` se queda
 * como red de seguridad para la carrera entre leer las huellas y escribir.
 *
 * NUNCA LANZA. Devuelve cuántas entraron en la cola DE VERDAD: con
 * `ignoreDuplicates`, PostgREST solo devuelve en `.select()` las filas que
 * insertó, así que las que ya existían no cuentan aquí ni en el `audit_log`
 * que las registra.
 */
export async function proponerAristas(entrada: {
  supabase: Admin;
  userId: string;
  autorizados: readonly Domain[];
}): Promise<number> {
  const { supabase, userId, autorizados } = entrada;
  try {
    const { data, error } = await supabase.rpc("graph_detectar_de", { p_uid: userId });
    if (error || !data?.length) return 0;

    const autorizadas = candidatosAutorizados(
      data.map(
        (r): Candidato => ({
          patron: r.patron as Candidato["patron"],
          sourceEntityId: r.source_entity_id,
          sourceLabel: r.source_label,
          sourceTable: r.source_table,
          targetEntityId: r.target_entity_id,
          targetLabel: r.target_label,
          targetTable: r.target_table,
          relType: r.rel_type as Candidato["relType"],
          similitud: r.similitud
        })
      ),
      autorizados,
      dominioDeTabla
    );

    // Las huellas ya en la cola, en cualquier estado: lo que ya se propuso no
    // vuelve a ocupar un slot ni a pagar la llamada al modelo de más abajo.
    const { data: existentes } = await supabase
      .from("coach_proposals")
      .select("fingerprint")
      .eq("user_id", userId)
      .like("fingerprint", "arista:%");
    const huellasExistentes = new Set(
      (existentes ?? []).map((e) => e.fingerprint).filter((f): f is string => f !== null)
    );
    const candidatos = sinPropuestasPrevias(autorizadas, huellasExistentes);

    const duplicados = candidatos
      .filter((c) => c.patron === "posible_duplicado")
      .map((c) => ({ c, p: propuestaDeArista(c, "Tienen casi el mismo nombre en el mismo proyecto.") }));

    // Si los duplicados nuevos ya llenan el cupo del día, ni vale la pena
    // agrupar `sin_meta` ni llamar al modelo: nada de lo que elija cabría.
    let emparejadas: { c: Candidato; p: ReturnType<typeof propuestaDeArista> }[] = [];
    if (duplicados.length < MAX_ARISTAS_POR_DIA) {
      const sinMeta = candidatos.filter((c) => c.patron === "sin_meta");
      const { sueltos, metas } = agruparSinMeta(sinMeta);
      const elegidas = await elegirMetas({ sueltos, metas });
      emparejadas = elegidas
        .map((e) => {
          const suelto = sueltos[e.suelto];
          const meta = metas[e.meta];
          if (!suelto || !meta) return null;
          const c = sinMeta.find((x) => x.sourceEntityId === suelto.entityId && x.targetEntityId === meta.entityId);
          return c ? { c, p: propuestaDeArista(c, e.porque) } : null;
        })
        .filter((x): x is { c: Candidato; p: ReturnType<typeof propuestaDeArista> } => x !== null);
    }

    const filas = [...duplicados, ...emparejadas]
      .filter((x) => x.p !== null)
      .slice(0, MAX_ARISTAS_POR_DIA)
      .map(({ c, p }) => ({
        user_id: userId,
        origen: "grafo" as const,
        tipo: "arista" as const,
        titulo: p!.titulo,
        detalle: p!.detalle,
        payload: p!.payload,
        fingerprint: huellaArista(c.relType, c.sourceEntityId, c.targetEntityId)
      }));

    if (!filas.length) return 0;
    const { data: insertadas, error: insertErr } = await supabase
      .from("coach_proposals")
      .upsert(filas, { onConflict: "user_id,fingerprint", ignoreDuplicates: true })
      .select("id");
    return insertErr ? 0 : (insertadas?.length ?? 0);
  } catch {
    return 0;
  }
}
