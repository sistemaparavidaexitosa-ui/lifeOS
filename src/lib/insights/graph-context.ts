import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { chainFacts, raicesDeHechos, type FilaCadena } from "@/lib/domain/insights/facts/chains.ts";
import { dominioDeTabla } from "@/lib/insights/context";
import type { Domain, Fact } from "@/lib/domain/insights/types.ts";

/**
 * EL GRAFO, COMO CONTEXTO DE LA IA.
 *
 * Toma los hechos ya calculados, recorre hacia arriba desde lo que los sustenta
 * y devuelve hechos de cadena. Dos modos, y la diferencia es de SEGURIDAD, no de
 * comodidad:
 *
 *  · `sesion` (chat, analyze): `graph_cadenas`, que lee `auth.uid()`.
 *  · `servicio` (coach, sin sesión): `graph_cadenas_de`, que recibe el usuario y
 *    solo puede llamarla `service_role`. El `userId` lo pone el despachador, no
 *    nada que venga de fuera.
 *
 * NUNCA LANZA (D-021): sin cadenas, la IA contesta con los hechos de siempre.
 */

export type ClienteDeCadenas = SupabaseClient<Database>;
export type ModoCadenas = { modo: "sesion" } | { modo: "servicio"; userId: string };

const PROFUNDIDAD = 4;

export async function loadChainFacts(
  supabase: ClienteDeCadenas,
  facts: readonly Fact[],
  autorizados: readonly Domain[],
  modo: ModoCadenas
): Promise<Fact[]> {
  const raices = raicesDeHechos(facts);
  if (!raices.length) return [];

  try {
    const { data, error } =
      modo.modo === "servicio"
        ? await supabase.rpc("graph_cadenas_de", { p_uid: modo.userId, p_entity_ids: raices, p_max_depth: PROFUNDIDAD })
        : await supabase.rpc("graph_cadenas", { p_entity_ids: raices, p_max_depth: PROFUNDIDAD });
    if (error || !data) return [];

    const filas: FilaCadena[] = data.map((r) => ({
      rootEntityId: r.root_entity_id,
      nodeId: r.node_id,
      parentId: r.parent_id,
      viaRel: r.via_rel,
      depth: r.depth,
      label: r.label,
      nodeType: r.node_type,
      entityTable: r.entity_table,
      entityId: r.entity_id
    }));

    return chainFacts({ facts, filas, autorizados, dominioDeTabla });
  } catch {
    return [];
  }
}
