import { EmptyState } from "@/components/ui";
import GraphWorkspace from "@/components/graph/GraphWorkspace";
import { defaultRootFor, loadSubgraph, nodeForEntity } from "@/lib/data/graph";
import { resolveView } from "@/lib/domain/graph/views";
import { loadLayout } from "./actions";

// El Execution Graph.
//
// Server Component, como todas las páginas del repo: aquí se resuelve la vista,
// se elige la raíz y se trae el primer vecindario. Todo lo interactivo vive en
// `GraphWorkspace`, que es cliente.
//
// LA RAÍZ PUEDE VENIR DE TRES SITIOS, EN ESTE ORDEN:
//   1. `?node=` — un nodo concreto, que es lo que ponen los enlaces internos.
//   2. `?entity=` — el id de una TAREA, un PROYECTO o lo que sea. Es la forma
//      de enlazar desde el resto de la aplicación sin que nadie tenga que saber
//      qué identificador tiene el nodo que la proyecta.
//   3. Nada: se elige la cosa más reciente del tipo que esa vista espera.
//
// Si no hay nada que enseñar se dice, y se dice de qué depende que lo haya. Un
// lienzo vacío sin explicación parece estropeado.

export default async function GraphPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; node?: string; entity?: string }>;
}) {
  const { view: viewParam, node, entity } = await searchParams;
  const view = resolveView(viewParam);

  const raiz = node !== undefined
    ? await nodeForEntity(node).then((r) =>
        r.root !== null || r.reason !== null
          ? r
          : // Un `?node=` que no está en `graph_nodes` puede ser un nodo nativo
            // recién creado que todavía no proyecta ninguna entidad: se usa tal
            // cual y que el recorrido diga si existe o no.
            { root: { nodeId: node, label: "", nodeType: "custom" as const }, reason: null }
      )
    : entity !== undefined
      ? await nodeForEntity(entity)
      : await defaultRootFor(view);

  // ROTO Y VACÍO NO SON LO MISMO, y esta pantalla llegó a confundirlos: contra
  // una base sin la migración 0054, PostgREST devuelve PGRST205, la consulta no
  // trae filas, y decir «todavía no hay nada que dibujar» era mentirle a
  // alguien que tenía sus proyectos abiertos en otra pestaña.
  if (raiz.reason !== null) {
    return (
      <div className="gr-shell">
        <div className="gr-fallo">
          <h2>El mapa de dependencias no está disponible en esta base de datos.</h2>
          <p>{raiz.reason}</p>
          <p className="gr-muted">
            Tus proyectos y tareas están intactos: este módulo LEE lo que ya existe, no lo guarda.
            En cuanto la migración se aplique, el grafo aparece solo con lo que ya tienes.
          </p>
        </div>
      </div>
    );
  }

  if (raiz.root === null) {
    return (
      <div className="gr-shell">
        <EmptyState
          icon="◍"
          text={
            view.scope === "workspace"
              ? "Todavía no hay nada en este espacio que dibujar. Crea un proyecto y vuelve: el grafo se construye solo a partir de lo que ya tienes."
              : "Todavía no hay metas, rutinas ni movimientos que dibujar. El grafo se construye solo a partir de lo que ya tienes."
          }
        />
      </div>
    );
  }

  const [subgrafo, posiciones] = await Promise.all([
    loadSubgraph(raiz.root.nodeId, view),
    loadLayout(view.id)
  ]);

  return (
    <GraphWorkspace
      view={view}
      initial={subgrafo}
      rootLabel={raiz.root.label === "" ? null : raiz.root.label}
      savedPositions={posiciones}
    />
  );
}
