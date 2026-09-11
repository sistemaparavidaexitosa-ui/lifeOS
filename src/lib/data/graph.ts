import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { describeDbError } from "@/lib/supabase/errors";
import { getSessionUser } from "@/lib/data/session";
import type {
  GraphEdge, GraphEdgeOrigin, GraphNode, GraphNodeType, GraphRelType, GraphScope, Subgraph
} from "@/lib/domain/graph/types";
import type { GraphView } from "@/lib/domain/graph/views";
import type { ImpactRow } from "@/lib/domain/graph/impact";

// La lectura del grafo.
//
// TODO PASA POR RPC, Y NO ES UNA PREFERENCIA DE ESTILO
// `supabase/config.toml` fija `max_rows = 1000`. Un `from("graph_nodes").select()`
// sobre un grafo de cien mil nodos devuelve mil filas Y NINGÚN ERROR: la
// pantalla se pintaría con un trozo del grafo creyendo que es el grafo entero,
// que es exactamente el modo de fallo que un mapa de dependencias no se puede
// permitir. Las RPC llevan su propio tope y devuelven `truncated` para decirlo.
//
// NO SE FILTRA POR user_id A MANO
// Igual que en `lib/data/notifications.ts`: la cerradura es la RLS, y repetirla
// aquí daría a entender que la de verdad es esta.
//
// UN FALLO NO SE DEVUELVE COMO «NO HAY NADA», NUNCA
// Estas funciones devolvían listas vacías ante cualquier error, y eso convirtió
// «la migración 0054 no está aplicada en esta base» en «todavía no hay nada que
// dibujar»: la pantalla le decía al dueño del sistema que no tenía proyectos
// mientras los tenía delante en otra pestaña. Es exactamente el incidente que
// documenta la cabecera de src/lib/supabase/errors.ts, repetido.
//
// Por eso cada lectura devuelve además un `reason`: null si todo fue bien, y el
// texto de `describeDbError` si no. Vacío y roto son cosas distintas y la
// pantalla tiene que poder decir cuál de las dos es.
//
// LAS FUNCIONES DE RECORRIDO LANZAN CUANDO NO HAY ACCESO
// `graph_impact` y `graph_subgraph` levantan 42501 si la raíz no es tuya. Aquí
// se traduce a lista vacía en vez de propagar: quien llama es un Server
// Component pintando una pantalla, y un nodo que ya no existe —o que dejó de
// ser tuyo— es un enlace viejo, no un error del sistema.

/** Lo que la barra lateral necesita para arrancar una vista sin pedir nada más. */
export interface GraphRoot {
  nodeId: string;
  label: string;
  nodeType: GraphNodeType;
}

/**
 * `root: null` y `reason: null` significa «no hay nada todavía», que es un
 * estado legítimo. `reason` con texto significa que algo falló y hay que
 * decirlo, no fingir que la base está vacía.
 */
export interface GraphRootResult {
  root: GraphRoot | null;
  reason: string | null;
}

function mapNode(row: {
  node_id: string; label: string; node_type: string; entity_table: string | null;
  entity_id: string | null; scope: string; metadata: unknown; depth: number;
}): GraphNode {
  return {
    id: row.node_id,
    label: row.label,
    nodeType: row.node_type as GraphNodeType,
    scope: row.scope as GraphScope,
    entityTable: row.entity_table,
    entityId: row.entity_id,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    depth: row.depth
  };
}

function mapEdge(row: {
  source_id: string; target_id: string; rel_type: string; origin: string;
  weight: number | null; confidence: number | null;
}): GraphEdge {
  return {
    sourceId: row.source_id,
    targetId: row.target_id,
    relType: row.rel_type as GraphRelType,
    origin: row.origin as GraphEdgeOrigin,
    weight: row.weight,
    confidence: row.confidence
  };
}

/**
 * El subgrafo alrededor de una raíz, con sus aristas.
 *
 * Son DOS llamadas y no una a propósito: los nodos y las aristas tienen formas
 * distintas y una sola RPC tendría que devolver un jsonb con las dos dentro,
 * que se pierde el tipado de PostgREST y obliga a validar a mano lo que la base
 * ya sabe. Dos llamadas tipadas contra una sin tipar no es discusión.
 */
export const loadSubgraph = cache(async (
  rootId: string,
  view: GraphView,
  depth?: number,
  maxNodes = 500
): Promise<Subgraph> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { nodes: [], edges: [], truncated: false, reason: null };

  const { data, error } = await supabase.rpc("graph_subgraph", {
    p_root: rootId,
    // `undefined` y no `null`: PostgREST omite el argumento y Postgres aplica
    // su propio DEFAULT null, que en la RPC significa «todos los tipos». Pasar
    // null explícito no lo permite la firma generada.
    p_node_types: view.nodeTypes ?? undefined,
    p_rel_types: view.relTypes ?? undefined,
    p_max_depth: depth ?? view.depth,
    p_max_nodes: maxNodes
  });
  // Un 42501 aquí no es un fallo que reportar: significa que la raíz dejó de
  // ser tuya o ya no existe, que es un enlace viejo. Lo demás sí se cuenta.
  if (error) {
    const enlaceViejo = error.code === "42501";
    return {
      nodes: [], edges: [], truncated: false,
      reason: enlaceViejo ? null : describeDbError(error)
    };
  }
  if (data === null) return { nodes: [], edges: [], truncated: false, reason: null };

  const nodes = data.map(mapNode);
  // `truncated` viene repetido en todas las filas —es una propiedad del
  // recorrido, no del nodo—, así que basta con mirar la primera.
  const truncated = data.length > 0 && data[0]!.truncated === true;
  if (nodes.length === 0) return { nodes: [], edges: [], truncated, reason: null };

  const { data: aristas } = await supabase.rpc("graph_edges_of", {
    p_nodes: nodes.map((n) => n.id)
  });

  const permitidas = view.relTypes === null ? null : new Set<string>(view.relTypes);
  const edges = (aristas ?? [])
    .map(mapEdge)
    .filter((e) => permitidas === null || permitidas.has(e.relType));

  return { nodes, edges, truncated, reason: null };
});

/**
 * Todos tus nodos de unos tipos, sin recorrer desde ninguna raíz.
 *
 * Es lo que consumen las vistas `rooted: false`. Un espacio de trabajo es un
 * nodo del que cuelga todo lo suyo; lo privado no tiene equivalente, así que
 * recorrer desde una meta suelta enseñaba esa meta y poco más.
 */
export const loadAllNodes = cache(async (view: GraphView, maxNodes = 500): Promise<Subgraph> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { nodes: [], edges: [], truncated: false, reason: null };

  const { data, error } = await supabase.rpc("graph_all", {
    p_node_types: view.nodeTypes ?? undefined,
    p_scope: view.scope,
    p_limit: maxNodes
  });
  if (error) return { nodes: [], edges: [], truncated: false, reason: describeDbError(error) };
  if (data === null || data.length === 0) {
    return { nodes: [], edges: [], truncated: false, reason: null };
  }

  const nodes = data.map(mapNode);
  const truncated = data[0]!.truncated === true;

  const { data: aristas } = await supabase.rpc("graph_edges_of", {
    p_nodes: nodes.map((n) => n.id)
  });
  const permitidas = view.relTypes === null ? null : new Set<string>(view.relTypes);
  const edges = (aristas ?? [])
    .map(mapEdge)
    .filter((e) => permitidas === null || permitidas.has(e.relType));

  return { nodes, edges, truncated, reason: null };
});

/** El análisis de impacto de un nodo, en las dos direcciones. */
export const loadImpact = cache(async (
  rootId: string,
  direction: "downstream" | "upstream" = "downstream",
  maxDepth = 6
): Promise<{ rows: ImpactRow[]; truncated: boolean }> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { rows: [], truncated: false };

  const { data, error } = await supabase.rpc("graph_impact", {
    p_root: rootId,
    p_direction: direction,
    p_max_depth: maxDepth,
    p_max_nodes: 500
  });
  if (error || data === null) return { rows: [], truncated: false };

  const rows: ImpactRow[] = data
    // La fila centinela del recorte no tiene nodo: solo trae `truncated`.
    .filter((r) => r.node_id !== null)
    .map((r) => ({
      nodeId: r.node_id,
      parentId: r.parent_id,
      viaRel: r.via_rel,
      depth: r.depth,
      label: r.label,
      nodeType: r.node_type as GraphNodeType,
      entityTable: r.entity_table,
      entityId: r.entity_id
    }));

  return { rows, truncated: data.some((r) => r.truncated === true) };
});

/**
 * La raíz por defecto de una vista cuando nadie ha dicho cuál.
 *
 * Se elige el nodo del tipo «contenedor» de esa vista con más cosas colgando,
 * porque abrir el lienzo en un nodo hoja enseña un punto solo y da la impresión
 * de que no hay nada. Se lee de `graph_nodes` con RLS puesta: aquí no hay
 * recorrido que optimizar, así que no hace falta bajar a una RPC.
 */
export const defaultRootFor = cache(async (view: GraphView): Promise<GraphRootResult> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { root: null, reason: null };

  const preferidos: Record<string, GraphNodeType[]> = {
    project: ["project"],
    workspace: ["workspace"],
    knowledge: ["project", "note"],
    personal: ["goal", "routine"],
    money: ["goal", "budget"],
    ai: ["goal", "project"],
    impact: ["project"]
  };
  const tipos = preferidos[view.id] ?? ["project"];

  const { data, error } = await supabase
    .from("graph_nodes")
    .select("id, label, node_type")
    .eq("scope", view.scope)
    .in("node_type", tipos)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  // AQUÍ es donde se veía el fallo: sin esta rama, una base sin la migración
  // 0054 devuelve PGRST205, `data` llega como null, y la pantalla concluía que
  // no tenías nada. describeDbError ya sabe traducir ese código desde este
  // mismo incidente.
  if (error) return { root: null, reason: describeDbError(error) };

  const fila = data?.[0];
  if (fila === undefined) return { root: null, reason: null };
  return {
    root: { nodeId: fila.id, label: fila.label, nodeType: fila.node_type as GraphNodeType },
    reason: null
  };
});

/** El nodo que proyecta una fila de dominio. Lo usa el enlace «ver en el grafo». */
export const nodeForEntity = cache(async (entityId: string): Promise<GraphRootResult> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { root: null, reason: null };

  const { data, error } = await supabase
    .from("graph_nodes")
    .select("id, label, node_type")
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) return { root: null, reason: describeDbError(error) };
  if (data === null) return { root: null, reason: null };
  return {
    root: { nodeId: data.id, label: data.label, nodeType: data.node_type as GraphNodeType },
    reason: null
  };
});
