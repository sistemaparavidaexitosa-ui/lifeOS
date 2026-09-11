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
 * Layout por capas, en forma de ÁRBOL.
 *
 * POR QUÉ NO BASTA CON UNA COLUMNA POR PROFUNDIDAD
 * La primera versión ponía todos los nodos de una capa en una columna ordenados
 * por etiqueta. Con siete proyectos y setenta y cuatro tareas eso da dos
 * columnas donde las tareas de un proyecto y las de otro quedan intercaladas
 * por casualidad alfabética. Se ve ordenado y no dice nada: lo único que un
 * mapa de dependencias tiene que contestar —de quién cuelga esto— es justo lo
 * que se pierde.
 *
 * CÓMO SE COLOCA
 * Es la idea de Reingold–Tilford sin sus refinamientos: las HOJAS se reparten
 * en orden, una tras otra, y cada nodo interno se centra sobre sus hijos. El
 * resultado es que cada proyecto queda a la altura del bloque de sus tareas, la
 * flecha sale del medio, y los bloques no se solapan.
 *
 * La `x` sigue saliendo de `depth`, que lo calculó Postgres en el recorrido: es
 * la profundidad MÍNIMA a la que se alcanzó cada nodo, y recalcularla aquí
 * sería repetir un trabajo hecho con los índices puestos.
 *
 * EL HUECO ENTRE HERMANOS NO ES DECORACIÓN. Sin él, dos proyectos seguidos se
 * leen como una lista continua de tareas y se pierde exactamente lo que este
 * layout viene a enseñar.
 */
export function treeLayout(
  nodes: readonly { id: string; depth: number; label: string }[],
  edges: readonly LayoutEdge[],
  options: { columnWidth?: number; rowHeight?: number; groupGap?: number } = {}
): Map<string, NodePosition> {
  const columnWidth = options.columnWidth ?? 260;
  const rowHeight = options.rowHeight ?? 56;
  const groupGap = options.groupGap ?? rowHeight * 0.6;

  const porId = new Map(nodes.map((n) => [n.id, n]));
  const orden = (a: string, b: string) => {
    const na = porId.get(a);
    const nb = porId.get(b);
    if (na === undefined || nb === undefined) return a.localeCompare(b);
    // Por etiqueta y no por orden de llegada: añadir una tarea no debe barajar
    // las demás. Desempate por id para que sea estable del todo.
    return na.label.localeCompare(nb.label, "es") || a.localeCompare(b);
  };

  // --- Quién cuelga de quién ------------------------------------------------
  // El padre de un nodo es su vecino en la capa ANTERIOR, venga la arista en el
  // sentido que venga: `belongs_to` sale del hijo y `parent_of` saldría del
  // padre, y a este layout le da igual cuál de los dos exista.
  const padreDe = new Map<string, string>();
  for (const e of edges) {
    const a = porId.get(e.sourceId);
    const b = porId.get(e.targetId);
    if (a === undefined || b === undefined) continue;
    const [hijo, padre] = a.depth > b.depth ? [a, b] : b.depth > a.depth ? [b, a] : [null, null];
    if (hijo === null || padre === null) continue;
    // Con dos candidatos gana el de etiqueta menor. Elegir «el primero que
    // llegue» haría que el dibujo dependiera del orden de las aristas.
    const actual = padreDe.get(hijo.id);
    if (actual === undefined || orden(padre.id, actual) < 0) padreDe.set(hijo.id, padre.id);
  }

  const hijosDe = new Map<string, string[]>();
  for (const [hijo, padre] of padreDe) {
    const l = hijosDe.get(padre) ?? [];
    l.push(hijo);
    hijosDe.set(padre, l);
  }
  for (const l of hijosDe.values()) l.sort(orden);

  // Raíces: lo que no cuelga de nada. Incluye los huérfanos —una tarea cuyo
  // proyecto todavía no se ha cargado— que se colocan sueltos en vez de
  // perderse.
  const raices = nodes.filter((n) => !padreDe.has(n.id)).map((n) => n.id).sort(orden);

  // --- Reparto vertical -----------------------------------------------------
  const pos = new Map<string, NodePosition>();
  let siguienteFila = 0;

  // Iterativo y no recursivo: un grafo grande desbordaría la pila, y los ciclos
  // heredados del dominio (D-121: las aristas `system` no se comprueban) harían
  // que una recursión ingenua no terminara nunca.
  const visitados = new Set<string>();
  const pila: { id: string; fase: "bajar" | "subir" }[] = [];
  for (const r of [...raices].reverse()) pila.push({ id: r, fase: "bajar" });

  while (pila.length > 0) {
    const actual = pila.pop()!;
    const nodo = porId.get(actual.id);
    if (nodo === undefined) continue;

    if (actual.fase === "bajar") {
      if (visitados.has(actual.id)) continue;
      visitados.add(actual.id);
      const hijos = (hijosDe.get(actual.id) ?? []).filter((h) => !visitados.has(h));
      if (hijos.length === 0) {
        // Hoja: ocupa la siguiente fila libre.
        pos.set(actual.id, { x: nodo.depth * columnWidth, y: siguienteFila * rowHeight });
        siguienteFila += 1;
        continue;
      }
      // Se vuelve a este nodo cuando sus hijos ya tengan sitio.
      pila.push({ id: actual.id, fase: "subir" });
      for (const h of [...hijos].reverse()) pila.push({ id: h, fase: "bajar" });
      continue;
    }

    // Subida: centrado sobre los hijos que de verdad se colocaron.
    const hijos = (hijosDe.get(actual.id) ?? []).map((h) => pos.get(h)).filter((p): p is NodePosition => p !== undefined);
    if (hijos.length === 0) {
      pos.set(actual.id, { x: nodo.depth * columnWidth, y: siguienteFila * rowHeight });
      siguienteFila += 1;
      continue;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const p of hijos) {
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
    }
    pos.set(actual.id, { x: nodo.depth * columnWidth, y: (min + max) / 2 });
    // El hueco se abre al CERRAR un bloque, no al abrirlo: así separa bloques
    // hermanos y no mete aire dentro de uno.
    siguienteFila += groupGap / rowHeight;
  }

  // Cualquiera que se haya quedado fuera —parte de un ciclo, por ejemplo— se
  // coloca igualmente. Un nodo sin posición no se dibuja, y un nodo que existe y
  // no se ve es peor que uno mal colocado.
  for (const n of nodes) {
    if (!pos.has(n.id)) {
      pos.set(n.id, { x: n.depth * columnWidth, y: siguienteFila * rowHeight });
      siguienteFila += 1;
    }
  }

  // Centrado en vertical alrededor del cero, para que la cámara inicial no
  // tenga que compensar un dibujo que empieza en la esquina.
  let min = Infinity;
  let max = -Infinity;
  for (const p of pos.values()) {
    if (p.y < min) min = p.y;
    if (p.y > max) max = p.y;
  }
  const centro = (min + max) / 2;
  for (const [id, p] of pos) pos.set(id, { x: p.x, y: p.y - centro });

  return pos;
}
