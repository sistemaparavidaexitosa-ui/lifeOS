"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { buildQuadtree } from "@/lib/domain/graph/quadtree";
import { createSimulation, forceLayout, layeredLayout, type Simulation } from "@/lib/domain/graph/layout";
import { cull, cullEdges, degreeOf, detailFor, pickLabels } from "@/lib/domain/graph/lod";
import { COLOR_VARS, styleOf, type ColorTable } from "@/lib/domain/graph/theme";
import {
  boundsOf, fitToBounds, panBy, screenToWorld, visibleWorld, zoomAt, type Viewport
} from "@/lib/domain/graph/viewport";
import { applySelection, esArrastre, marquee, modeFromEvent } from "@/lib/domain/graph/selection";
import type { GraphEdge, GraphNode, NodePosition } from "@/lib/domain/graph/types";
import { drawGraph } from "./draw";

// El lienzo. Es el ÚNICO archivo del módulo que toca <canvas>.
//
// LA DECISIÓN QUE ORDENA TODO ESTE COMPONENTE: QUÉ VA EN ESTADO Y QUÉ EN REFS
//
// Las posiciones, la cámara y el fotograma en curso viven en `useRef`, NO en
// `useState`. No es una optimización prematura: la simulación mueve quinientos
// nodos sesenta veces por segundo, y cada `setState` es un render de React más
// una reconciliación. Con las posiciones en estado, arrastrar un nodo dispara
// sesenta renders por segundo del árbol entero y el navegador se arrodilla.
//
// En estado de React va solo lo DISCRETO —qué está seleccionado, qué vista,
// qué filtros—, que cambia cuando una persona hace algo y no sesenta veces por
// segundo. Esa frontera es la que hace que esto funcione con miles de nodos.
//
// POR QUÉ LA SIMULACIÓN CORRE DENTRO DEL BUCLE DE DIBUJO Y NO EN UN WORKER
// Se consideró un trabajador web (la CSP ya lo permite: `worker-src 'self'`
// está en middleware.ts desde las notificaciones push). No hace falta: el
// recorrido tope de la base son 5.000 nodos, y un paso de Barnes-Hut sobre eso
// son unos pocos milisegundos. Repartiéndolo en un presupuesto por fotograma,
// el hilo principal nunca se bloquea Y se ve la colocación animada, que enseña
// la estructura mucho mejor que verla ya colocada. Un trabajador añadiría un
// canal de mensajes y un modo de fallo nuevo a cambio de nada.

export interface GraphCanvasHandle {
  fit(): void;
  focusOn(nodeId: string): void;
}

export interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** "layered" cuando el orden es el contenido (dependencias); si no, fuerzas. */
  layoutMode: "force" | "layered";
  /** Lo que esta persona colocó a mano en esta vista. Gana al auto-layout. */
  savedPositions: Record<string, NodePosition>;
  selected: ReadonlySet<string>;
  onSelectedChange(next: Set<string>): void;
  /** Nodos del camino crítico: se resaltan y el resto se apaga. */
  highlighted?: ReadonlySet<string>;
  onNodeActivate?(nodeId: string): void;
  /**
   * Solo cuando alguien ARRASTRA. Esto se persiste, así que no puede dispararse
   * con las posiciones del auto-layout: si lo hiciera, cada nodo quedaría
   * marcado como «colocado a mano» la primera vez que se abre la pantalla y la
   * colocación automática no volvería a aplicarse jamás —ni siquiera al
   * cambiar de vista o al llegar nodos nuevos—.
   */
  onNodesMoved?(positions: { nodeId: string; x: number; y: number }[]): void;
  /** Cada vez que las posiciones se estabilizan. Para el minimapa; NO se guarda. */
  onPositionsChanged?(positions: Map<string, NodePosition>): void;
  onViewportChange?(v: Viewport, bounds: { x: number; y: number; width: number; height: number } | null): void;
  /** Handle imperativo para «encajar» y «llévame a este nodo». */
  handleRef?: { current: GraphCanvasHandle | null };
}

/** Cuánto tiempo del fotograma se le deja a la simulación. 16 ms es un cuadro. */
const PRESUPUESTO_MS = 6;

export default function GraphCanvas({
  nodes, edges, layoutMode, savedPositions, selected, onSelectedChange,
  highlighted, onNodeActivate, onNodesMoved, onPositionsChanged, onViewportChange, handleRef
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contenedorRef = useRef<HTMLDivElement | null>(null);

  const posiciones = useRef<Map<string, NodePosition>>(new Map());
  const simulacion = useRef<Simulation | null>(null);
  const camara = useRef<Viewport>({ x: -400, y: -300, scale: 1, width: 800, height: 600 });
  const colores = useRef<ColorTable>({});
  const encima = useRef<string | null>(null);
  const rect = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const gesto = useRef<
    | { tipo: "ninguno" }
    | { tipo: "pan"; ultimo: { x: number; y: number } }
    | { tipo: "nodo"; id: string; movido: boolean }
    | { tipo: "rect"; desde: { x: number; y: number }; hasta: { x: number; y: number } }
  >({ tipo: "ninguno" });
  const sucio = useRef(true);
  /** La barra espaciadora, para arrastrar el lienzo sin botón central. */
  const espacio = useRef(false);

  // Props que el bucle de dibujo necesita leer sin volver a montarse. Guardarlas
  // en refs es lo que permite que el efecto del bucle no dependa de ellas: si
  // dependiera, cada cambio de selección cancelaría y recrearía el bucle.
  const props = useRef({ nodes, edges, selected, highlighted, onSelectedChange, onNodeActivate, onViewportChange });
  props.current = { nodes, edges, selected, highlighted, onSelectedChange, onNodeActivate, onViewportChange };

  const grados = useMemo(() => degreeOf(edges), [edges]);

  // --- Colocación inicial ---------------------------------------------------
  useEffect(() => {
    const guardadas = new Map<string, NodePosition>(Object.entries(savedPositions));

    // Quien ha pedido no ver animaciones tampoco quiere ver cien nodos
    // recolocándose: se corre la simulación entera de golpe y se pinta el
    // resultado. Cuesta unos milisegundos más al abrir y ni un fotograma
    // después.
    const sinAnimacion = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (layoutMode === "layered") {
      // La profundidad ya la calculó Postgres en el recorrido: recalcularla
      // aquí sería repetir un trabajo que se hizo con los índices puestos.
      const calculadas = layeredLayout(nodes.map((n) => ({ id: n.id, depth: n.depth, label: n.label })));
      posiciones.current = new Map(calculadas);
      simulacion.current = null;
    } else if (sinAnimacion) {
      posiciones.current = forceLayout(nodes, edges);
      simulacion.current = null;
    } else {
      const sim = createSimulation(nodes, edges);
      simulacion.current = sim;
      posiciones.current = sim.positions();
    }

    // Lo colocado a mano gana SIEMPRE, y además se fija en la simulación: si
    // no, las fuerzas empujarían el nodo fuera del sitio donde alguien lo puso
    // a propósito, que se ve como «no me guarda la posición».
    for (const [id, p] of guardadas) {
      posiciones.current.set(id, p);
      simulacion.current?.pin(id, p);
    }

    const b = boundsOf([...posiciones.current.values()]);
    if (b !== null) {
      camara.current = fitToBounds(camara.current, b);
      rect.current = b;
    }
    // El layout por capas ya está terminado aquí: sin este aviso, el minimapa
    // se quedaría vacío en las vistas de dependencias, que no simulan nada.
    onPositionsChanged?.(new Map(posiciones.current));
    sucio.current = true;
    // `savedPositions` se compara por identidad a propósito: llega del servidor
    // ya memorizado por vista, y meterlo en las dependencias con un objeto
    // nuevo cada render recolocaría el grafo en cada repintado.
  }, [nodes, edges, layoutMode, savedPositions, onPositionsChanged]);

  // --- Tamaño del lienzo ----------------------------------------------------
  useEffect(() => {
    const cont = contenedorRef.current;
    const canvas = canvasRef.current;
    if (cont === null || canvas === null) return;

    const ajustar = () => {
      const r = cont.getBoundingClientRect();
      // El lienzo se dibuja en píxeles FÍSICOS y se escala por CSS a los
      // lógicos: sin esto, en una pantalla retina todo sale borroso.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      camara.current = { ...camara.current, width: r.width, height: r.height };
      sucio.current = true;
    };

    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(cont);
    return () => ro.disconnect();
  }, []);

  // --- Colores del tema -----------------------------------------------------
  useEffect(() => {
    const leer = () => {
      const cs = getComputedStyle(document.documentElement);
      const tabla: ColorTable = {};
      for (const v of COLOR_VARS) tabla[v] = cs.getPropertyValue(v).trim();
      colores.current = tabla;
      sucio.current = true;
    };
    leer();
    // El tema se cambia poniendo `data-theme` en <html>. Observarlo es más
    // barato y más fiable que un contexto de React que habría que propagar.
    const mo = new MutationObserver(leer);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // --- El bucle -------------------------------------------------------------
  useEffect(() => {
    let vivo = true;
    let raf = 0;
    let ultimoAviso = 0;

    const fotograma = () => {
      if (!vivo) return;
      raf = requestAnimationFrame(fotograma);

      const sim = simulacion.current;
      if (sim !== null) {
        const t0 = performance.now();
        let alpha = 1;
        // Tantos pasos como quepan en el presupuesto. En un grafo pequeño
        // caben veinte y se coloca casi al instante; en uno grande cabe uno y
        // se coloca despacio, pero el fotograma SIEMPRE se cierra.
        while (alpha > 0 && performance.now() - t0 < PRESUPUESTO_MS) {
          alpha = sim.tick();
        }
        posiciones.current = sim.positions();
        sucio.current = true;
        if (alpha === 0) {
          simulacion.current = null;
          const b = boundsOf([...posiciones.current.values()]);
          if (b !== null) rect.current = b;
          // Se avisa UNA vez, al parar, y con un mínimo entre avisos: durante
          // la simulación las posiciones cambian sesenta veces por segundo y
          // notificarlas sería devolver a React el trabajo que las refs evitan.
          if (Date.now() - ultimoAviso > 500) {
            ultimoAviso = Date.now();
            onPositionsChanged?.(new Map(posiciones.current));
          }
        }
      }

      if (!sucio.current) return;
      sucio.current = false;
      pintar();
    };

    const pintar = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas === undefined || canvas === null || ctx === null || ctx === undefined) return;

      const v = camara.current;
      const dpr = canvas.width / Math.max(v.width, 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const p = props.current;
      const vista = visibleWorld(v);
      // El margen del recorte se calcula en unidades del MUNDO a partir del
      // radio más grande más el hueco de la etiqueta.
      const margen = 40 / v.scale + 30;
      const conPos = p.nodes
        .map((n) => {
          const pos = posiciones.current.get(n.id);
          return pos === undefined ? null : { ...n, x: pos.x, y: pos.y };
        })
        .filter((n): n is GraphNode & NodePosition => n !== null);

      const visibles = cull(conPos, vista, margen);
      const idsVisibles = new Set(visibles.map((n) => n.id));
      const aristas = cullEdges(p.edges, idsVisibles);
      const etiquetados = detailFor(v.scale) === "label"
        ? pickLabels(visibles, grados)
        : new Set<string>();

      // El rectángulo de selección se guarda en coordenadas de PANTALLA (es un
      // gesto) y se pasa en coordenadas del mundo (es dibujo).
      const g = gesto.current;
      const rectSel = g.tipo === "rect"
        ? (() => {
            const a = screenToWorld(v, g.desde.x, g.desde.y);
            const b = screenToWorld(v, g.hasta.x, g.hasta.y);
            return marquee(a, b);
          })()
        : null;

      // El escalado por dpr ya está aplicado en el contexto; drawGraph vuelve a
      // fijar la transformación con la cámara, así que se le pasa un contexto
      // que ya sabe su densidad de píxeles.
      ctx.save();
      ctx.scale(1, 1);
      drawGraph(ctx as CanvasRenderingContext2D, {
        nodes: visibles,
        edges: aristas,
        positions: posiciones.current,
        viewport: v,
        colors: colores.current,
        selected: p.selected,
        hovered: encima.current,
        highlighted: p.highlighted ?? new Set<string>(),
        labelled: etiquetados,
        marquee: rectSel
      });
      ctx.restore();

      p.onViewportChange?.(v, rect.current);
    };

    raf = requestAnimationFrame(fotograma);
    return () => { vivo = false; cancelAnimationFrame(raf); };
  }, [grados, onPositionsChanged]);

  // --- Entrada --------------------------------------------------------------
  useEffect(() => {
    const abajo = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      // Si el foco está en un campo de texto, la barra espaciadora es una
      // barra espaciadora. Sin esta comprobación, escribir en el buscador
      // pondría el lienzo en modo arrastre.
      const activo = document.activeElement;
      if (activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement) return;
      espacio.current = true;
      // Evita que la página haga scroll mientras se arrastra el lienzo.
      e.preventDefault();
    };
    const arriba = (e: KeyboardEvent) => { if (e.code === "Space") espacio.current = false; };
    window.addEventListener("keydown", abajo);
    window.addEventListener("keyup", arriba);
    // Al perder el foco de la ventana no llega el keyup y la barra se quedaría
    // "pulsada" para siempre.
    const soltar = () => { espacio.current = false; };
    window.addEventListener("blur", soltar);
    return () => {
      window.removeEventListener("keydown", abajo);
      window.removeEventListener("keyup", arriba);
      window.removeEventListener("blur", soltar);
    };
  }, []);

  const enPantalla = useCallback((e: { clientX: number; clientY: number }) => {
    const r = contenedorRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }, []);

  const nodoEn = useCallback((sx: number, sy: number): string | null => {
    const v = camara.current;
    const w = screenToWorld(v, sx, sy);
    const puntos = [...posiciones.current].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    const arbol = buildQuadtree(puntos);
    // El radio de acierto crece al alejarse para que siga siendo posible dar a
    // un nodo con el ratón cuando mide dos píxeles.
    const cerca = arbol.nearest(w.x, w.y, 30 / v.scale);
    if (cerca === null) return null;
    const nodo = props.current.nodes.find((n) => n.id === cerca.id);
    if (nodo === undefined) return null;
    const d = Math.hypot(cerca.x - w.x, cerca.y - w.y);
    return d <= Math.max(styleOf(nodo.nodeType).radius, 12 / v.scale) ? cerca.id : null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    // `passive: false` es obligatorio: sin él el navegador ignora el
    // preventDefault y la rueda hace scroll de la página en vez de zoom.
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const p = enPantalla(e);
      // ctrlKey en una rueda es el gesto de pellizco de un trackpad, y ahí el
      // delta llega mucho más grande: se atenúa para que no dé un salto.
      const factor = Math.exp((-e.deltaY * (e.ctrlKey ? 0.35 : 1)) / 400);
      camara.current = zoomAt(camara.current, p.x, p.y, factor);
      sucio.current = true;
    };
    canvas.addEventListener("wheel", rueda, { passive: false });
    return () => canvas.removeEventListener("wheel", rueda);
  }, [enPantalla]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = enPantalla(e);

    // Botón central o barra espaciadora pulsada = arrastrar el lienzo. Es la
    // convención de todas las herramientas de este tipo y la gente la trae
    // aprendida; el botón izquierdo sobre el vacío hace rectángulo, no pan.
    if (e.button === 1 || espacio.current) {
      gesto.current = { tipo: "pan", ultimo: p };
      return;
    }

    const id = nodoEn(p.x, p.y);
    if (id !== null) {
      gesto.current = { tipo: "nodo", id, movido: false };
      // Fijarlo mientras dura el arrastre: si no, las fuerzas siguen tirando de
      // él y el nodo se escapa del cursor.
      simulacion.current?.pin(id, posiciones.current.get(id) ?? { x: 0, y: 0 });
      return;
    }

    gesto.current = { tipo: "rect", desde: p, hasta: p };
  }, [enPantalla, nodoEn]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = enPantalla(e);
    const g = gesto.current;

    if (g.tipo === "ninguno") {
      const id = nodoEn(p.x, p.y);
      if (id !== encima.current) {
        encima.current = id;
        sucio.current = true;
      }
      return;
    }

    if (g.tipo === "pan") {
      camara.current = panBy(camara.current, p.x - g.ultimo.x, p.y - g.ultimo.y);
      gesto.current = { tipo: "pan", ultimo: p };
      sucio.current = true;
      return;
    }

    if (g.tipo === "nodo") {
      const w = screenToWorld(camara.current, p.x, p.y);
      // Arrastrar un nodo arrastra TODA la selección si ese nodo estaba
      // seleccionado. Sin esto, mover un grupo hay que hacerlo de uno en uno.
      const sel = props.current.selected;
      const mueve = sel.has(g.id) ? [...sel] : [g.id];
      const base = posiciones.current.get(g.id);
      if (base !== undefined) {
        const dx = w.x - base.x;
        const dy = w.y - base.y;
        for (const id of mueve) {
          const q = posiciones.current.get(id);
          if (q === undefined) continue;
          const nuevo = { x: q.x + dx, y: q.y + dy };
          posiciones.current.set(id, nuevo);
          simulacion.current?.pin(id, nuevo);
        }
      }
      gesto.current = { tipo: "nodo", id: g.id, movido: true };
      sucio.current = true;
      return;
    }

    gesto.current = { tipo: "rect", desde: g.desde, hasta: p };
    sucio.current = true;
  }, [enPantalla, nodoEn]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = enPantalla(e);
    const g = gesto.current;
    gesto.current = { tipo: "ninguno" };

    if (g.tipo === "nodo") {
      if (!g.movido) {
        props.current.onSelectedChange(applySelection(props.current.selected, [g.id], modeFromEvent(e)));
      } else if (onNodesMoved !== undefined) {
        const sel = props.current.selected;
        const movidos = sel.has(g.id) ? [...sel] : [g.id];
        onNodesMoved(
          movidos
            .map((id) => {
              const q = posiciones.current.get(id);
              return q === undefined ? null : { nodeId: id, x: q.x, y: q.y };
            })
            .filter((x): x is { nodeId: string; x: number; y: number } => x !== null)
        );
      }
      sucio.current = true;
      return;
    }

    if (g.tipo === "rect") {
      if (!esArrastre(g.desde, p)) {
        // Un clic en el vacío deselecciona. Es lo que espera todo el mundo y
        // es la única forma de vaciar la selección sin ir a un botón.
        props.current.onSelectedChange(applySelection(props.current.selected, [], modeFromEvent(e)));
        sucio.current = true;
        return;
      }
      const v = camara.current;
      const r = marquee(screenToWorld(v, g.desde.x, g.desde.y), screenToWorld(v, p.x, p.y));
      const dentro = [...posiciones.current]
        .filter(([, q]) => q.x >= r.x && q.x <= r.x + r.width && q.y >= r.y && q.y <= r.y + r.height)
        .map(([id]) => id);
      props.current.onSelectedChange(applySelection(props.current.selected, dentro, modeFromEvent(e)));
      sucio.current = true;
    }
  }, [enPantalla, onNodesMoved]);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = enPantalla(e);
    const id = nodoEn(p.x, p.y);
    if (id !== null) props.current.onNodeActivate?.(id);
  }, [enPantalla, nodoEn]);

  // --- Handle imperativo ----------------------------------------------------
  useEffect(() => {
    if (handleRef === undefined) return;
    handleRef.current = {
      fit() {
        const b = boundsOf([...posiciones.current.values()]);
        if (b !== null) camara.current = fitToBounds(camara.current, b);
        sucio.current = true;
      },
      focusOn(nodeId: string) {
        const p = posiciones.current.get(nodeId);
        if (p === undefined) return;
        const v = camara.current;
        // Se centra sin tocar el zoom: cambiar las dos cosas a la vez desorienta.
        camara.current = { ...v, x: p.x - v.width / (2 * v.scale), y: p.y - v.height / (2 * v.scale) };
        sucio.current = true;
      }
    };
    return () => { handleRef.current = null; };
  }, [handleRef]);

  return (
    <div ref={contenedorRef} className="gr-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="gr-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Lienzo del grafo"
        role="img"
      />
    </div>
  );
}
