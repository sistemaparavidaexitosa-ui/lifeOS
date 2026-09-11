import { EmptyState } from "@/components/ui";
import GraphWorkspace from "@/components/graph/GraphWorkspace";
import { defaultRootFor, loadAllNodes, loadSubgraph, nodeForEntity } from "@/lib/data/graph";
import { resolveView } from "@/lib/domain/graph/views";
import { listWorkspaces } from "@/lib/data/workspaces";
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
  searchParams: Promise<{ view?: string; node?: string; entity?: string; ws?: string }>;
}) {
  const { view: viewParam, node, entity, ws } = await searchParams;
  const view = resolveView(viewParam);

  // EL ESPACIO ACTIVO, CON LA MISMA PRECEDENCIA QUE /execution: `?ws=` si
  // todavía lo alcanzas, si no el personal, si no el primero.
  //
  // Antes esto no existía y el grafo elegía espacio SOLO por fecha, lo que con
  // el backfill de la 0054 —que le puso el mismo `updated_at` a todos los nodos
  // de espacio— era elegirlo al azar: con tres espacios, abría en uno distinto
  // según le diera. El enlace además es compartible, igual que en /execution.
  const espacios = view.scope === "workspace" ? await listWorkspaces() : [];
  const espacioActivo =
    espacios.find((w) => w.id === ws) ??
    espacios.find((w) => w.isPersonal) ??
    espacios[0];

  // LAS VISTAS SIN RAÍZ NO NECESITAN PUNTO DE PARTIDA, y por eso no pueden
  // fallar por elegirlo mal. Lo privado no tiene un nodo contenedor —no existe
  // un «nodo usuario» del que cuelguen las metas y los hábitos—, así que aquí
  // se piden todos los nodos de sus tipos en vez de recorrer desde uno suelto.
  if (!view.rooted && node === undefined && entity === undefined) {
    const todo = await loadAllNodes(view);
    if (todo.reason !== null) return <GraphNoDisponible reason={todo.reason} />;
    if (todo.nodes.length === 0) return <GraphVacio scope={view.scope} />;
    return (
      <GraphWorkspace
        view={view}
        initial={todo}
        rootLabel={null}
        workspaces={[]}
        activeWorkspaceId={null}
        savedPositions={await loadLayout(view.id)}
      />
    );
  }

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
      : await defaultRootFor(view, espacioActivo?.id ?? null);

  // ROTO Y VACÍO NO SON LO MISMO, y esta pantalla llegó a confundirlos: contra
  // una base sin la migración 0054, PostgREST devuelve PGRST205, la consulta no
  // trae filas, y decir «todavía no hay nada que dibujar» era mentirle a
  // alguien que tenía sus proyectos abiertos en otra pestaña.
  if (raiz.reason !== null) return <GraphNoDisponible reason={raiz.reason} />;
  if (raiz.root === null) return <GraphVacio scope={view.scope} />;

  const [subgrafo, posiciones] = await Promise.all([
    loadSubgraph(raiz.root.nodeId, view),
    loadLayout(view.id)
  ]);

  return (
    <GraphWorkspace
      view={view}
      initial={subgrafo}
      rootLabel={raiz.root.label === "" ? null : raiz.root.label}
      workspaces={espacios.map((w) => ({ id: w.id, name: w.name, isPersonal: w.isPersonal }))}
      activeWorkspaceId={espacioActivo?.id ?? null}
      savedPositions={posiciones}
    />
  );
}


/**
 * Roto y vacío no son lo mismo, y esta pantalla llegó a confundirlos: contra una
 * base sin la migración 0054, PostgREST devuelve PGRST205, la consulta no trae
 * filas, y decir «todavía no hay nada que dibujar» era mentirle a alguien que
 * tenía sus proyectos abiertos en otra pestaña.
 */
function GraphNoDisponible({ reason }: { reason: string }) {
  return (
    <div className="gr-shell">
      <div className="gr-fallo">
        <h2>El mapa de dependencias no está disponible en esta base de datos.</h2>
        <p>{reason}</p>
        <p className="gr-muted">
          Tus proyectos y tareas están intactos: este módulo LEE lo que ya existe, no lo guarda.
          En cuanto la migración se aplique, el grafo aparece solo con lo que ya tienes.
        </p>
      </div>
    </div>
  );
}

function GraphVacio({ scope }: { scope: "workspace" | "user" }) {
  return (
    <div className="gr-shell">
      <EmptyState
        icon="◍"
        text={
          scope === "workspace"
            ? "Todavía no hay nada en este espacio que dibujar. Crea un proyecto y vuelve: el grafo se construye solo a partir de lo que ya tienes."
            : "Todavía no hay metas, rutinas ni movimientos que dibujar. El grafo se construye solo a partir de lo que ya tienes."
        }
      />
    </div>
  );
}
