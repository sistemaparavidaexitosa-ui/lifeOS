"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { actionOk, describeDbError, type ActionResult } from "@/lib/supabase/errors";
import type { GraphNodeType, GraphRelType } from "@/lib/domain/graph/types";

// Las escrituras del lienzo.
//
// CONTRATO DE ERROR: `{ ok, reason }`, el de D-021/D-030. Aquí SIEMPRE hay
// dónde pintar el motivo —el lienzo tiene una barra de estado— y los motivos
// que llegan de la base son de los buenos: «no se puede relacionar X con Y
// porque uno es privado». Ese texto lo escribe el trigger de la migración 0054
// en español y `describeDbError` lo deja pasar tal cual (por eso el trigger usa
// P0001 y no 23514; ver el comentario de la migración).
//
// LO QUE ESTE ARCHIVO NO PUEDE HACER, Y ES DELIBERADO:
//   - No borra aristas `system`. Son la proyección del dominio: si sobra la
//     dependencia entre dos tareas, se quita en el tablero, que es donde vive.
//     Borrarla aquí la haría reaparecer en el siguiente guardado y parecería
//     un fallo.
//   - No crea nodos proyectados. Un nodo con `entity_id` lo escribe un trigger
//     o no existe; la política de la tabla lo exige además de este archivo.
//   - No inserta aristas con origin 'ai'. Esas pasan por su cola de propuestas
//     y por un botón, igual que las del coach (0053).

const REL_TYPES = [
  "depends_on", "blocks", "leads_to", "caused_by", "child_of", "parent_of",
  "belongs_to", "supports", "references", "created_from", "generated_by_ai",
  "assigned_to", "related_to", "duplicates"
] as const satisfies readonly GraphRelType[];

/** Los únicos tipos que una persona puede dibujar: los que no tienen tabla detrás. */
const TIPOS_NATIVOS = ["custom", "risk", "meeting", "ai_conversation"] as const satisfies readonly GraphNodeType[];

const edgeSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  relType: z.enum(REL_TYPES)
});

export async function createGraphEdge(
  sourceId: string,
  targetId: string,
  relType: string
): Promise<ActionResult> {
  const parsed = edgeSchema.safeParse({ sourceId, targetId, relType });
  if (!parsed.success) return { ok: false, reason: "Esa relación no es válida." };
  if (parsed.data.sourceId === parsed.data.targetId) {
    return { ok: false, reason: "Un nodo no puede relacionarse consigo mismo." };
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const supabase = await createClient();
  const { error } = await supabase.from("graph_edges").insert({
    source_id: parsed.data.sourceId,
    target_id: parsed.data.targetId,
    rel_type: parsed.data.relType,
    origin: "user",
    created_by: user.id
  });
  // El mensaje del trigger de frontera y el del detector de ciclos llegan aquí
  // intactos, y son mejores que cualquier cosa que pudiéramos escribir nosotros
  // porque nombran los dos nodos concretos.
  if (error) return { ok: false, reason: describeDbError(error) };

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "graph.edge.create", object: parsed.data.targetId,
    meta: { source: parsed.data.sourceId, rel: parsed.data.relType }
  });
  revalidatePath("/graph");
  return actionOk;
}

export async function deleteGraphEdge(
  sourceId: string,
  relType: string,
  targetId: string
): Promise<ActionResult> {
  const parsed = edgeSchema.safeParse({ sourceId, targetId, relType });
  if (!parsed.success) return { ok: false, reason: "Esa relación no es válida." };

  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("graph_edges")
    .delete()
    .eq("source_id", parsed.data.sourceId)
    .eq("rel_type", parsed.data.relType)
    .eq("target_id", parsed.data.targetId)
    .select("source_id");

  if (error) return { ok: false, reason: describeDbError(error) };
  // Un DELETE que no casa ninguna fila no da error: o la política lo filtró
  // (es 'system', o no la ves) o alguien la borró antes. Distinguirlo importa
  // porque el primer caso es el que hay que explicar.
  if (data === null || data.length === 0) {
    return {
      ok: false,
      reason: "Esa relación no se puede borrar desde aquí: la mantiene el propio dato (una dependencia del tablero, una tarea dentro de su proyecto). Quítala donde vive."
    };
  }
  revalidatePath("/graph");
  return actionOk;
}

const nodeSchema = z.object({
  label: z.string().trim().min(1, "Ponle un nombre.").max(200),
  nodeType: z.enum(TIPOS_NATIVOS),
  scope: z.enum(["workspace", "user"]),
  workspaceId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable()
});

/**
 * Un nodo dibujado a mano: un riesgo, una reunión, cualquier cosa que el
 * sistema todavía no modela. Es lo que el brief llama «Custom Node».
 */
export async function createCustomNode(formData: FormData): Promise<ActionResult & { nodeId?: string }> {
  const scope = String(formData.get("scope") ?? "user");
  const parsed = nodeSchema.safeParse({
    label: formData.get("label"),
    nodeType: formData.get("nodeType"),
    scope,
    workspaceId: scope === "workspace" ? formData.get("workspaceId") : null,
    projectId: scope === "workspace" ? (formData.get("projectId") || null) : null
  });
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "No se pudo crear el nodo." };
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (parsed.data.scope === "workspace" && parsed.data.workspaceId === null) {
    return { ok: false, reason: "Falta el espacio de trabajo." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("graph_nodes")
    .insert({
      scope: parsed.data.scope,
      user_id: parsed.data.scope === "user" ? user.id : null,
      workspace_id: parsed.data.scope === "workspace" ? parsed.data.workspaceId : null,
      project_id: parsed.data.scope === "workspace" ? parsed.data.projectId : null,
      node_type: parsed.data.nodeType,
      label: parsed.data.label
    })
    .select("id")
    .single();

  if (error) return { ok: false, reason: describeDbError(error) };
  revalidatePath("/graph");
  return { ...actionOk, nodeId: data.id };
}

export async function deleteCustomNode(nodeId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(nodeId);
  if (!parsed.success) return { ok: false, reason: "Ese nodo no es válido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("graph_nodes")
    .delete()
    .eq("id", parsed.data)
    .is("entity_id", null)
    .select("id");

  if (error) return { ok: false, reason: describeDbError(error) };
  if (data === null || data.length === 0) {
    return {
      ok: false,
      reason: "Ese nodo no se borra desde el grafo: representa algo real (una tarea, una meta, una nota) y desaparece cuando desaparece eso."
    };
  }
  revalidatePath("/graph");
  return actionOk;
}

const layoutSchema = z.object({
  view: z.string().trim().min(1).max(40),
  // Cien posiciones por guardado: es más de lo que nadie mueve de una vez, y
  // pone un techo a lo que un cliente puede empujar en una sola llamada.
  positions: z.array(z.object({
    nodeId: z.string().uuid(),
    x: z.number().finite(),
    y: z.number().finite()
  })).min(1).max(100)
});

/**
 * Dónde ha colocado esta persona estos nodos en esta vista.
 *
 * Es una escritura por LOTE porque el gesto lo es: soltar una selección de
 * quince nodos son quince posiciones nuevas a la vez. Una llamada por nodo
 * serían quince viajes para un solo arrastre.
 */
export async function saveLayout(
  view: string,
  positions: { nodeId: string; x: number; y: number }[]
): Promise<ActionResult> {
  const parsed = layoutSchema.safeParse({ view, positions });
  if (!parsed.success) return { ok: false, reason: "No se pudo guardar la colocación." };

  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const supabase = await createClient();
  const { error } = await supabase.from("graph_layouts").upsert(
    parsed.data.positions.map((p) => ({
      node_id: p.nodeId,
      user_id: user.id,
      view: parsed.data.view,
      x: p.x,
      y: p.y,
      updated_at: new Date().toISOString()
    })),
    { onConflict: "node_id,user_id,view" }
  );

  if (error) return { ok: false, reason: describeDbError(error) };
  // A propósito SIN revalidatePath: mover nodos no cambia nada de lo que el
  // servidor pintó, y revalidar en cada arrastre volvería a montar el lienzo
  // entero —con su layout— cada vez que alguien suelta el ratón.
  return actionOk;
}

/** Devolver el layout guardado de una vista. Lo pide el lienzo al montarse. */
export async function loadLayout(view: string): Promise<Record<string, { x: number; y: number }>> {
  const user = await getSessionUser();
  if (!user) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("graph_layouts")
    .select("node_id, x, y")
    .eq("view", view);

  const out: Record<string, { x: number; y: number }> = {};
  for (const fila of data ?? []) out[fila.node_id] = { x: fila.x, y: fila.y };
  return out;
}

/** La búsqueda instantánea de la barra del lienzo. */
export async function searchGraph(query: string) {
  const parsed = z.string().trim().min(2).max(80).safeParse(query);
  if (!parsed.success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("graph_search", { p_query: parsed.data, p_limit: 20 });
  return (data ?? []).map((r) => ({
    nodeId: r.node_id,
    label: r.label,
    nodeType: r.node_type as GraphNodeType,
    entityTable: r.entity_table,
    entityId: r.entity_id
  }));
}

/**
 * El informe de impacto de un nodo.
 *
 * Es una acción y no una lectura del Server Component porque el panel lateral
 * cambia al seleccionar, y volver a pintar la página entera por cambiar de nodo
 * seleccionado tiraría el estado del lienzo —la cámara, la colocación, la
 * animación en curso—. El recorrido lo hace igualmente Postgres; lo único que
 * viaja es el resultado.
 */
export async function fetchImpact(
  nodeId: string,
  direction: "downstream" | "upstream" = "downstream"
) {
  const parsed = z.string().uuid().safeParse(nodeId);
  if (!parsed.success) return null;
  const { loadImpact } = await import("@/lib/data/graph");
  const { buildImpactReport } = await import("@/lib/domain/graph/impact");
  const { rows, truncated } = await loadImpact(parsed.data, direction);
  return buildImpactReport(rows, truncated);
}
