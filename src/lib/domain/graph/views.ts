// Las siete vistas.
//
// LA IDEA QUE SOSTIENE TODO EL MÓDULO
// No son siete pantallas. Son siete FILTROS sobre el mismo grafo, pintados por
// el mismo lienzo, leídos por la misma consulta. Cada una es este objeto de
// diez líneas y nada más; si mañana hacen falta tres vistas más, son treinta
// líneas aquí y cero componentes nuevos.
//
// Por eso lo importante de este archivo no es lo que hay, es lo que NO hay:
// ni un `if (view === 'money')` en ningún componente, ni una consulta por
// vista, ni un layout por vista. La vista es un dato.
//
// SOBRE LA FRONTERA DE PRIVACIDAD
// Fíjate en `scope`. Las vistas de Proyecto, Espacio y Conocimiento son de
// espacio; las de Personal, Dinero e IA son privadas. Eso NO es una decisión de
// diseño de esta pantalla: es la consecuencia directa de BR-012, que impide que
// una arista una un nodo privado con uno de un espacio. Los dos mundos son
// grafos separados en la base, así que también lo son aquí. Una vista que
// mezclara ambos saldría siempre partida en dos mitades sin una sola línea
// entre ellas.

import type { GraphNodeType, GraphRelType, GraphScope } from "./types.ts";

export type GraphViewId =
  | "project" | "workspace" | "knowledge" | "personal" | "money" | "ai" | "impact";

export interface GraphView {
  id: GraphViewId;
  label: string;
  /** Frase corta para la barra de herramientas. Lo que contesta esta vista. */
  hint: string;
  scope: GraphScope;
  /** Qué tipos de nodo entran. `null` = todos. */
  nodeTypes: GraphNodeType[] | null;
  /** Qué relaciones se siguen. `null` = todas. */
  relTypes: GraphRelType[] | null;
  /** Por capas cuando el orden es el contenido; por fuerzas cuando no lo es. */
  layout: "force" | "layered";
  /**
   * Si la vista RECORRE desde un nodo o trae todos los de sus tipos.
   *
   * Un espacio de trabajo es un nodo del que cuelga todo lo suyo, así que
   * recorrer desde ahí enseña el espacio entero. Lo privado no tiene
   * equivalente: no existe un «nodo usuario» del que cuelguen las metas, los
   * hábitos y el dinero. Recorrer desde una meta suelta enseña esa meta y poco
   * más, que es exactamente lo que se reportó. Esas vistas piden TODO lo suyo y
   * dejan que el lienzo lo coloque.
   */
  rooted: boolean;
  /** Saltos que se traen de entrada. Más profundidad, más espera. */
  depth: number;
}

export const GRAPH_VIEWS: Record<GraphViewId, GraphView> = {
  project: {
    id: "project",
    label: "Proyecto",
    hint: "Qué depende de qué dentro de un proyecto",
    scope: "workspace",
    nodeTypes: ["project", "task", "person", "document"],
    relTypes: ["depends_on", "blocks", "child_of", "belongs_to", "assigned_to"],
    layout: "layered",
    depth: 3,
    rooted: true
  },
  workspace: {
    id: "workspace",
    label: "Espacio",
    hint: "Cómo se relacionan los proyectos entre sí",
    scope: "workspace",
    nodeTypes: ["workspace", "project", "person"],
    relTypes: ["depends_on", "blocks", "belongs_to", "related_to", "assigned_to"],
    layout: "force",
    depth: 2,
    rooted: true
  },
  knowledge: {
    id: "knowledge",
    label: "Conocimiento",
    hint: "Notas, documentos, decisiones y lecturas",
    scope: "workspace",
    nodeTypes: ["note", "document", "meeting", "decision", "book", "project"],
    relTypes: ["references", "created_from", "belongs_to", "related_to", "duplicates"],
    layout: "force",
    depth: 3,
    rooted: true
  },
  personal: {
    id: "personal",
    label: "Personal",
    hint: "Metas, hábitos y rutinas, y qué alimenta a qué",
    scope: "user",
    nodeTypes: ["goal", "habit", "routine", "book", "decision"],
    relTypes: ["supports", "belongs_to", "depends_on", "leads_to", "related_to"],
    layout: "force",
    depth: 3,
    rooted: false
  },
  money: {
    id: "money",
    label: "Dinero",
    hint: "Inversiones, presupuesto y activos",
    scope: "user",
    nodeTypes: ["investment", "budget", "asset", "goal"],
    relTypes: ["supports", "belongs_to", "leads_to", "related_to"],
    layout: "force",
    depth: 3,
    rooted: false
  },
  ai: {
    id: "ai",
    label: "Descubierto por IA",
    hint: "Solo lo que ha propuesto el modelo y tú has aceptado",
    scope: "user",
    nodeTypes: null,
    relTypes: ["generated_by_ai", "related_to", "duplicates", "caused_by"],
    layout: "force",
    depth: 2,
    rooted: false
  },
  impact: {
    id: "impact",
    label: "Impacto",
    hint: "Qué se rompe si esto cambia",
    scope: "workspace",
    nodeTypes: null,
    relTypes: ["depends_on", "blocks", "leads_to", "caused_by", "child_of"],
    layout: "layered",
    depth: 6,
    rooted: true
  }
};

export const VIEW_ORDER: GraphViewId[] = [
  "project", "workspace", "knowledge", "personal", "money", "ai", "impact"
];

/**
 * `Object.hasOwn` y no `in`: el operador `in` recorre la cadena de prototipos,
 * así que `"toString" in GRAPH_VIEWS` es true y `?view=toString` devolvía una
 * FUNCIÓN donde la pantalla esperaba una vista. El identificador viene de la
 * barra de direcciones, o sea de fuera, y ahí `in` no vale nunca.
 */
export function isGraphViewId(value: string | null | undefined): value is GraphViewId {
  return typeof value === "string" && Object.hasOwn(GRAPH_VIEWS, value);
}

/**
 * La vista pedida, o la de proyecto.
 *
 * Devuelve siempre algo: el identificador viene de la barra de direcciones, así
 * que un enlace viejo o mal copiado es normal y no debe dar una pantalla de
 * error. Lo mismo que hace `library/page.tsx` con `?por=`.
 */
export function resolveView(value: string | null | undefined): GraphView {
  return isGraphViewId(value) ? GRAPH_VIEWS[value] : GRAPH_VIEWS.project;
}
