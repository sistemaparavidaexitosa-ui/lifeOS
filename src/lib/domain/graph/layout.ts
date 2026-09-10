// El auto-layout: dónde va cada nodo cuando nadie lo ha colocado a mano.
//
// DOS ALGORITMOS, PORQUE SON DOS PREGUNTAS DISTINTAS
//
//   - `forceLayout` (dirigido por fuerzas) para «enséñame de qué va esto»:
//     agrupa lo que está conectado y separa lo que no. Es lo que se quiere en
//     el Knowledge Graph o en el Workspace Graph, donde no hay un orden.
//   - `layeredLayout` (por capas) para «¿qué va antes que qué?»: coloca las
//     dependencias en columnas por profundidad, y con eso el camino crítico se
//     lee de izquierda a derecha sin tener que seguir flechas. Es lo que se
//     quiere en el Project Graph y en el Impact Graph, donde el orden ES el
//     contenido. Un layout por fuerzas ahí es bonito e ilegible.
//
// DETERMINISMO, Y POR QUÉ NO ES UN LUJO
// Con `Math.random()`, el mismo grafo sale colocado distinto cada vez que se
// abre la pantalla. Eso rompe la memoria visual —«mi proyecto grande estaba
// arriba a la izquierda»— y hace imposible probar nada. El generador va con
// semilla, y la semilla sale de los propios identificadores: mismo grafo,
// mismo dibujo, hoy y dentro de un año, en este ordenador y en el de al lado.
//
// BARNES-HUT
// La repulsión de todos contra todos es O(n²): a diez mil nodos son cien
// millones de operaciones POR PASO. El árbol cuaternario resume un cuadrante
// lejano en su centro de masa y lo deja en O(n log n). El parámetro que decide
// cuándo un cuadrante está «lo bastante lejos» es `theta`.

import { buildQuadtree, type QuadPoint } from "./quadtree.ts";
import type { NodePosition } from "./types.ts";

export interface LayoutNode {
  id: string;
}

export interface LayoutEdge {
  sourceId: string;
  targetId: string;
}

export interface LayoutOptions {
  /** Pasos de simulación. 300 es donde deja de moverse casi nada. */
  iterations?: number;
  /** Distancia de reposo de un enlace, en unidades del mundo. */
  linkDistance?: number;
  /** Fuerza de repulsión. Negativa = se repelen. */
  charge?: number;
  /**
   * Umbral de Barnes-Hut. 0 = exacto y lentísimo; 1.5 = rapidísimo y con
   * artefactos visibles (grupos que se pegan). 0.9 es el punto donde el error
   * deja de notarse a simple vista.
   */
  theta?: number;
}

const POR_DEFECTO: Required<LayoutOptions> = {
  iterations: 300,
  linkDistance: 120,
  charge: -900,
  theta: 0.9
};

/**
 * Generador con semilla (mulberry32).
 *
 * Se escribe aquí en ocho líneas en vez de traer una dependencia: es la única
 * aleatoriedad de todo el módulo y D-008 sigue en pie.
 */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** La semilla sale del grafo, no del reloj. Ver arriba. */
export function seedOf(nodes: readonly LayoutNode[]): number {
  let h = 2166136261;
  for (const n of nodes) {
    for (let i = 0; i < n.id.length; i++) {
      h ^= n.id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

/**
 * Posiciones de partida en espiral de Fibonacci.
 *
 * Repartir al azar dentro de un cuadrado deja huecos y amontonamientos que la
 * simulación tarda cien pasos en deshacer. La espiral reparte de forma casi
 * uniforme desde el primer fotograma, así que el layout converge antes y —lo
 * que más se nota— no da el respingo inicial de todos los nodos saliendo
 * disparados de un montón.
 */
function posicionesIniciales(nodes: readonly LayoutNode[], rnd: () => number, linkDistance: number): Map<string, NodePosition> {
  const pos = new Map<string, NodePosition>();
  const paso = Math.PI * (3 - Math.sqrt(5)); // ángulo áureo
  const radio = linkDistance * Math.sqrt(nodes.length) * 0.6;
  nodes.forEach((n, i) => {
    const r = radio * Math.sqrt((i + 0.5) / nodes.length);
    const a = i * paso;
    // Un pelín de ruido con semilla: sin él, dos nodos con el mismo índice en
    // subgrafos distintos empiezan exactamente encima y la repulsión no sabe
    // hacia dónde empujarlos (la dirección sale de una división por cero).
    pos.set(n.id, {
      x: Math.cos(a) * r + (rnd() - 0.5),
      y: Math.sin(a) * r + (rnd() - 0.5)
    });
  });
  return pos;
}

export interface Simulation {
  /** Un paso. Devuelve el «alfa»: cuánta energía queda. Cero = terminado. */
  tick(): number;
  positions(): Map<string, NodePosition>;
  /** Fija un nodo (lo está arrastrando alguien) o lo suelta con `null`. */
  pin(id: string, at: NodePosition | null): void;
}

/**
 * La simulación paso a paso.
 *
 * Se expone así, y no solo como una función que devuelve el resultado final,
 * porque el lienzo quiere ANIMAR la colocación: ver a los nodos ordenarse
 * enseña la estructura mucho mejor que verlos aparecer ya ordenados. El
 * trabajador web llama a `tick()` y va mandando posiciones.
 */
export function createSimulation(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions = {}
): Simulation {
  const o = { ...POR_DEFECTO, ...options };
  const rnd = prng(seedOf(nodes));
  const pos = posicionesIniciales(nodes, rnd, o.linkDistance);
  const vel = new Map<string, NodePosition>();
  const fijos = new Map<string, NodePosition>();
  for (const n of nodes) vel.set(n.id, { x: 0, y: 0 });

  // El grado importa: un nodo con cincuenta aristas no debe salir disparado por
  // la suma de cincuenta muelles, así que su atracción se reparte. Sin esto los
  // «god nodes» del grafo (un espacio con todos sus proyectos) colapsan el
  // dibujo hacia sí mismos.
  const grado = new Map<string, number>();
  for (const e of edges) {
    grado.set(e.sourceId, (grado.get(e.sourceId) ?? 0) + 1);
    grado.set(e.targetId, (grado.get(e.targetId) ?? 0) + 1);
  }

  let alpha = 1;
  const decay = 1 - Math.pow(0.001, 1 / o.iterations);

  function tick(): number {
    if (alpha < 0.001) return 0;
    alpha += (0 - alpha) * decay;

    // --- Repulsión, con Barnes-Hut ------------------------------------------
    const puntos: QuadPoint[] = [];
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      puntos.push({ id: n.id, x: p.x, y: p.y });
    }
    const arbol = buildQuadtree(puntos);

    for (const n of nodes) {
      if (fijos.has(n.id)) continue;
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      arbol.walk((cx, cy, count, width, hoja) => {
        let dx = cx - p.x;
        let dy = cy - p.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          // Coincidentes: se empujan en una dirección estable en vez de
          // dividir por cero. Con semilla, para no romper el determinismo.
          dx = rnd() - 0.5;
          dy = rnd() - 0.5;
          d2 = dx * dx + dy * dy + 1e-6;
        }
        const lejano = width * width < o.theta * o.theta * d2;
        if (lejano || hoja !== null) {
          const f = (o.charge * count * alpha) / d2;
          v.x += dx * f;
          v.y += dy * f;
          return true; // el resumen basta, no bajar más
        }
        return false;
      });
    }

    // --- Atracción por las aristas ------------------------------------------
    for (const e of edges) {
      const a = pos.get(e.sourceId);
      const b = pos.get(e.targetId);
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const f = ((d - o.linkDistance) / d) * alpha * 0.5;
      const ga = grado.get(e.sourceId) ?? 1;
      const gb = grado.get(e.targetId) ?? 1;
      // El extremo con más grado se mueve menos: reparte el tirón entre los dos
      // de forma inversa a lo conectado que está cada uno.
      const pesoA = gb / (ga + gb);
      const pesoB = ga / (ga + gb);
      if (!fijos.has(e.sourceId)) {
        const v = vel.get(e.sourceId)!;
        v.x += dx * f * pesoA;
        v.y += dy * f * pesoA;
      }
      if (!fijos.has(e.targetId)) {
        const v = vel.get(e.targetId)!;
        v.x -= dx * f * pesoB;
        v.y -= dy * f * pesoB;
      }
    }

    // --- Integración, con rozamiento ----------------------------------------
    for (const n of nodes) {
      const fijo = fijos.get(n.id);
      if (fijo !== undefined) {
        pos.set(n.id, { x: fijo.x, y: fijo.y });
        vel.set(n.id, { x: 0, y: 0 });
        continue;
      }
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      v.x *= 0.6;
      v.y *= 0.6;
      // Tope de velocidad: sin él, un grafo muy denso puede dar un paso en el
      // que un nodo se va a diez mil unidades y ya no vuelve.
      const max = o.linkDistance * 2;
      v.x = Math.max(-max, Math.min(max, v.x));
      v.y = Math.max(-max, Math.min(max, v.y));
      pos.set(n.id, { x: p.x + v.x, y: p.y + v.y });
    }

    return alpha;
  }

  return {
    tick,
    positions: () => new Map(pos),
    pin: (id, at) => {
      if (at === null) fijos.delete(id);
      else fijos.set(id, at);
    }
  };
}

/** Corre la simulación entera. Es lo que usa el trabajador cuando no anima. */
export function forceLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions = {}
): Map<string, NodePosition> {
  const sim = createSimulation(nodes, edges, options);
  const pasos = options.iterations ?? POR_DEFECTO.iterations;
  for (let i = 0; i < pasos; i++) {
    if (sim.tick() === 0) break;
  }
  return sim.positions();
}

/**
 * Layout por capas para las vistas de dependencia.
 *
 * `depth` viene de la base: `graph_impact` devuelve la profundidad MÍNIMA a la
 * que se alcanzó cada nodo, así que la columna ya está calculada y aquí solo
 * hay que repartir en vertical. Recalcularla en el navegador sería repetir un
 * recorrido que Postgres acaba de hacer con los índices puestos.
 *
 * Dentro de cada columna se ordena por etiqueta y NO por el orden en que
 * llegaron: así añadir una tarea no baraja las demás.
 */
export function layeredLayout(
  nodes: readonly { id: string; depth: number; label: string }[],
  options: { columnWidth?: number; rowHeight?: number } = {}
): Map<string, NodePosition> {
  const columnWidth = options.columnWidth ?? 260;
  const rowHeight = options.rowHeight ?? 72;
  const porCapa = new Map<number, { id: string; label: string }[]>();
  for (const n of nodes) {
    const capa = porCapa.get(n.depth) ?? [];
    capa.push({ id: n.id, label: n.label });
    porCapa.set(n.depth, capa);
  }

  const pos = new Map<string, NodePosition>();
  for (const [depth, capa] of porCapa) {
    capa.sort((a, b) => a.label.localeCompare(b.label, "es") || a.id.localeCompare(b.id));
    // Centrada en vertical: las columnas quedan alineadas por el medio y el
    // dibujo se lee como un árbol, no como una escalera.
    const alto = (capa.length - 1) * rowHeight;
    capa.forEach((n, i) => {
      pos.set(n.id, { x: depth * columnWidth, y: i * rowHeight - alto / 2 });
    });
  }
  return pos;
}
