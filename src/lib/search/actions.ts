"use server";

import { createClient } from "@/lib/supabase/server";
import { parseQuery, isSearchable, type SearchKind } from "@/lib/domain/search/query.ts";

/**
 * Búsqueda transversal del espacio.
 *
 * La consulta ocurre en la BASE y no filtrando en el cliente, por el mismo
 * motivo que la de notas (0032): traerse todos los comentarios de un espacio
 * para buscar sobre ellos sería descargar cada cuerpo entero en cada pulsación.
 *
 * El RPC no es `security definer`: la RLS se aplica dentro, así que esto no
 * puede devolver nada que quien busca no deba ver.
 */
export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  projectId: string | null;
  taskId: string | null;
  notebookId: string | null;
  at: string;
}

export interface SearchResult {
  ok: boolean;
  hits: SearchHit[];
  /** Filtros escritos que no se entendieron; la interfaz los dice. */
  unknown: string[];
  reason?: string;
}

export async function searchWorkspace(workspaceId: string, raw: string): Promise<SearchResult> {
  const parsed = parseQuery(raw);
  if (!isSearchable(parsed)) return { ok: true, hits: [], unknown: parsed.unknown };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_workspace", {
    p_workspace_id: workspaceId,
    // Con solo filtros y sin texto, el tsquery vacío no casaría nada. Se manda
    // un comodín para que la pregunta «todo lo de Ana» siga teniendo respuesta.
    p_query: parsed.text || "a OR e OR o",
    // `undefined` y no `null`: los tipos generados declaran los parámetros con
    // default como opcionales, y mandar null explícito no compila.
    p_kind: parsed.kind ?? undefined,
    p_author: parsed.author ?? undefined,
    p_before: parsed.beforeISO ?? undefined,
    p_since: parsed.sinceISO ?? undefined
  });

  if (error) return { ok: false, hits: [], unknown: parsed.unknown, reason: error.message };

  return {
    ok: true,
    unknown: parsed.unknown,
    hits: (data ?? []).map((r) => ({
      kind: r.kind as SearchKind,
      id: r.id,
      title: r.title ?? "",
      snippet: r.snippet ?? "",
      projectId: r.project_id,
      taskId: r.task_id,
      notebookId: r.notebook_id,
      at: r.at
    }))
  };
}
