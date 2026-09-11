// El dibujo. Nada de React aquí dentro: entran datos y un contexto 2D, salen
// píxeles.
//
// POR QUÉ NO ESTÁ EN src/lib/domain
// Porque toca `CanvasRenderingContext2D`, y el runner de pruebas del repo
// (`node --test`) no tiene DOM. Todo lo que SÍ se puede probar —el recorte, el
// nivel de detalle, los tamaños, las posiciones— vive en `lib/domain/graph/**`
// y aquí solo queda el trazado, que es la parte que se verifica mirándola.
//
// LAS REGLAS DE RENDIMIENTO QUE ESTE ARCHIVO SIGUE, Y POR QUÉ
//   1. Un `beginPath()` por GRUPO, no por elemento. Cada trazado tiene un coste
//      fijo grande; agrupar todas las aristas del mismo estilo en un solo
//      camino es la diferencia entre mil llamadas y cuatro.
//   2. `fillText` solo cuando el nivel de detalle lo pide y solo para los
//      elegidos. Es la operación más cara del lienzo con diferencia.
//   3. Cero `save()`/`restore()` por nodo. Se ordena el dibujo por estilo para
//      no tener que ir cambiando el estado del contexto.
//   4. Nada de sombras (`shadowBlur`): en un lienzo grande cuestan más que
//      todo lo demás junto y aquí no aportan nada.

import { detailFor, type DetailLevel } from "@/lib/domain/graph/lod";
import { edgeStyleOf, styleOf, type ColorTable } from "@/lib/domain/graph/theme";
import type { Viewport } from "@/lib/domain/graph/viewport";
import type { GraphEdge, GraphNode, NodePosition } from "@/lib/domain/graph/types";

export interface DrawInput {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  positions: ReadonlyMap<string, NodePosition>;
  viewport: Viewport;
  colors: ColorTable;
  selected: ReadonlySet<string>;
  hovered: string | null;
  /** Nodos del camino crítico, resaltados sobre el resto. */
  highlighted: ReadonlySet<string>;
  /** A quién le toca etiqueta este fotograma. */
  labelled: ReadonlySet<string>;
  /** El rectángulo de selección en curso, en coordenadas del mundo. */
  marquee: { x: number; y: number; width: number; height: number } | null;
  /**
   * Píxeles físicos por píxel de CSS.
   *
   * TIENE QUE ENTRAR AQUÍ, y esa es la corrección de un fallo real: antes el
   * componente aplicaba el `dpr` con `setTransform` y acto seguido esta función
   * volvía a llamar a `setTransform`, que REEMPLAZA la matriz en vez de
   * componerla. El `dpr` se perdía entero. En un teléfono con pantalla del
   * doble de densidad eso dibujaba el grafo a la mitad de tamaño dentro del
   * cuarto superior izquierdo del búfer, y como `clearRect` también limpiaba
   * solo ese cuarto, el resto no se borraba nunca y quedaban rastros al mover.
   */
  dpr: number;
}

export function drawGraph(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const { viewport: v, colors } = input;
  const detail = detailFor(v.scale);
  const dpr = input.dpr > 0 ? input.dpr : 1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // El búfer ENTERO, en píxeles físicos. Limpiar solo el tamaño en CSS dejaba
  // sin borrar el resto de la pantalla en cualquier equipo de alta densidad.
  ctx.clearRect(0, 0, v.width * dpr, v.height * dpr);

  // Una sola matriz para las dos cosas: la cámara y la densidad de pantalla.
  // Componerlas aquí —y no en dos llamadas— es lo que impide que la segunda se
  // coma a la primera. A partir de esta línea todo se dibuja en coordenadas del
  // MUNDO y nadie multiplica nada a mano.
  const k = v.scale * dpr;
  ctx.setTransform(k, 0, 0, k, -v.x * k, -v.y * k);

  drawEdges(ctx, input, detail);
  drawNodes(ctx, input, detail);
  if (input.marquee !== null) drawMarquee(ctx, input.marquee, colors, v.scale);
}

function drawEdges(ctx: CanvasRenderingContext2D, input: DrawInput, detail: DetailLevel): void {
  // A este zoom las aristas son ruido gris: no se dibujan y se gana la mitad
  // del fotograma. Lo que se ve entonces es la NUBE, que es lo que se está
  // mirando cuando se aleja tanto.
  if (detail === "dot") return;

  const { positions, colors, viewport: v, highlighted } = input;
  const linea = colors["--line"] ?? "#d8d8e4";
  const acento = colors["--accent"] ?? "#6161ff";

  // Dos pasadas: primero las normales, luego las resaltadas encima. Sin esto,
  // el camino crítico queda tapado por las aristas que pasan por delante.
  for (const resaltadas of [false, true]) {
    // Agrupadas por estilo para no tocar el estado del contexto por arista.
    for (const dashed of [false, true]) {
      ctx.beginPath();
      let hay = false;
      for (const e of input.edges) {
        const est = edgeStyleOf(e.relType);
        if (est.dashed !== dashed) continue;
        const esResaltada = highlighted.has(e.sourceId) && highlighted.has(e.targetId);
        if (esResaltada !== resaltadas) continue;
        const a = positions.get(e.sourceId);
        const b = positions.get(e.targetId);
        if (a === undefined || b === undefined) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        hay = true;
      }
      if (!hay) continue;
      // El ancho se divide por la escala para que la línea mantenga su grosor
      // en PANTALLA: si no, al alejarse las líneas desaparecen y al acercarse
      // se convierten en tuberías.
      ctx.lineWidth = (resaltadas ? 2.2 : 1.2) / v.scale;
      ctx.strokeStyle = resaltadas ? acento : linea;
      ctx.globalAlpha = resaltadas ? 0.95 : 0.5;
      ctx.setLineDash(dashed ? [4 / v.scale, 4 / v.scale] : []);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Las puntas de flecha solo de cerca: son cuatro trazos por arista y a un
  // zoom medio no se distinguen de la propia línea.
  if (detail !== "label") return;
  ctx.fillStyle = linea;
  for (const e of input.edges) {
    if (!edgeStyleOf(e.relType).arrow) continue;
    const a = positions.get(e.sourceId);
    const b = positions.get(e.targetId);
    if (a === undefined || b === undefined) continue;
    punta(ctx, a, b, styleOf(nodeTypeOf(input.nodes, e.targetId)).radius, 7 / v.scale);
  }
}

function nodeTypeOf(nodes: readonly GraphNode[], id: string): string {
  return nodes.find((n) => n.id === id)?.nodeType ?? "custom";
}

/** La punta, retranqueada para que no se meta dentro de la burbuja del destino. */
function punta(
  ctx: CanvasRenderingContext2D,
  a: NodePosition, b: NodePosition, radio: number, tam: number
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < radio + 1) return;
  const ux = dx / d;
  const uy = dy / d;
  const px = b.x - ux * radio;
  const py = b.y - uy * radio;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - ux * tam - uy * tam * 0.45, py - uy * tam + ux * tam * 0.45);
  ctx.lineTo(px - ux * tam + uy * tam * 0.45, py - uy * tam - ux * tam * 0.45);
  ctx.closePath();
  ctx.fill();
}

function drawNodes(ctx: CanvasRenderingContext2D, input: DrawInput, detail: DetailLevel): void {
  const { positions, colors, viewport: v, selected, hovered, highlighted, labelled } = input;
  const acento = colors["--accent"] ?? "#6161ff";
  const superficie = colors["--surface"] ?? "#ffffff";
  const texto = colors["--text"] ?? "#14142b";

  if (detail === "dot") {
    // Un rectángulo de un píxel de pantalla por nodo. Sin bordes, sin
    // círculos: `arc` a este tamaño cuesta el triple y se ve idéntico.
    const lado = 2 / v.scale;
    for (const n of input.nodes) {
      const p = positions.get(n.id);
      if (p === undefined) continue;
      ctx.fillStyle = colors[styleOf(n.nodeType).colorVar] ?? acento;
      ctx.fillRect(p.x - lado / 2, p.y - lado / 2, lado, lado);
    }
    return;
  }

  for (const n of input.nodes) {
    const p = positions.get(n.id);
    if (p === undefined) continue;
    const est = styleOf(n.nodeType);
    const color = colors[est.colorVar] ?? acento;
    const esSel = selected.has(n.id);
    const esRes = highlighted.has(n.id);

    ctx.beginPath();
    ctx.arc(p.x, p.y, est.radius, 0, Math.PI * 2);
    // Los nodos que no están en el camino resaltado se apagan en vez de
    // esconderse: sigue viéndose la forma del grafo alrededor de la respuesta.
    ctx.globalAlpha = highlighted.size > 0 && !esRes ? 0.25 : 1;
    ctx.fillStyle = color;
    ctx.fill();

    if (esSel || n.id === hovered) {
      ctx.lineWidth = (esSel ? 3 : 2) / v.scale;
      ctx.strokeStyle = esSel ? acento : superficie;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  if (detail !== "label") return;

  // El texto, en una sola pasada al final: cambiar `font` y `fillStyle` es lo
  // caro, así que se hace una vez para todas las etiquetas.
  ctx.font = `${13 / v.scale}px Inter, ui-sans-serif, -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = texto;
  for (const n of input.nodes) {
    if (!labelled.has(n.id)) continue;
    const p = positions.get(n.id);
    if (p === undefined) continue;
    ctx.globalAlpha = highlighted.size > 0 && !highlighted.has(n.id) ? 0.35 : 1;
    ctx.fillText(recorta(n.label), p.x, p.y + styleOf(n.nodeType).radius + 5 / v.scale);
  }
  ctx.globalAlpha = 1;
}

/**
 * Se recorta por caracteres y no midiendo con `measureText`.
 *
 * Medir es una llamada al motor de tipografía por etiqueta, o sea cuatrocientas
 * por fotograma. Veintiocho caracteres es lo que cabe bajo la burbuja más ancha
 * sin pisar a la de al lado; pasarse un poco es mejor que gastar el fotograma
 * en medir.
 */
function recorta(label: string): string {
  return label.length <= 28 ? label : `${label.slice(0, 27)}…`;
}

function drawMarquee(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; width: number; height: number },
  colors: ColorTable,
  scale: number
): void {
  const acento = colors["--accent"] ?? "#6161ff";
  ctx.fillStyle = acento;
  ctx.globalAlpha = 0.08;
  ctx.fillRect(r.x, r.y, r.width, r.height);
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = acento;
  ctx.lineWidth = 1 / scale;
  ctx.strokeRect(r.x, r.y, r.width, r.height);
  ctx.globalAlpha = 1;
}

/** El minimapa: los mismos datos, sin texto y con el rectángulo de la vista. */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  input: Pick<DrawInput, "nodes" | "positions" | "colors" | "viewport">,
  bounds: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
  dpr = 1
): void {
  const { colors, positions, viewport: v } = input;
  // Mismo fallo que arriba, misma corrección: la densidad va DENTRO de la
  // matriz, no en una llamada previa que esta línea borraría.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  const escala = Math.min(size.width / Math.max(bounds.width, 1), size.height / Math.max(bounds.height, 1)) * 0.9;
  const offX = size.width / 2 - (bounds.x + bounds.width / 2) * escala;
  const offY = size.height / 2 - (bounds.y + bounds.height / 2) * escala;

  for (const n of input.nodes) {
    const p = positions.get(n.id);
    if (p === undefined) continue;
    ctx.fillStyle = colors[styleOf(n.nodeType).colorVar] ?? "#6161ff";
    ctx.fillRect(p.x * escala + offX - 1, p.y * escala + offY - 1, 2.5, 2.5);
  }

  ctx.strokeStyle = colors["--text"] ?? "#14142b";
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    v.x * escala + offX,
    v.y * escala + offY,
    (v.width / v.scale) * escala,
    (v.height / v.scale) * escala
  );
  ctx.globalAlpha = 1;
}

/** Convierte un clic del minimapa a coordenadas del mundo. */
export function minimapToWorld(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number }
): NodePosition {
  const escala = Math.min(size.width / Math.max(bounds.width, 1), size.height / Math.max(bounds.height, 1)) * 0.9;
  const offX = size.width / 2 - (bounds.x + bounds.width / 2) * escala;
  const offY = size.height / 2 - (bounds.y + bounds.height / 2) * escala;
  return { x: (point.x - offX) / escala, y: (point.y - offY) / escala };
}
