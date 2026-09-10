"use client";

import { useEffect, useRef } from "react";
import { COLOR_VARS, type ColorTable } from "@/lib/domain/graph/theme";
import type { Viewport } from "@/lib/domain/graph/viewport";
import type { GraphNode, NodePosition, Rect } from "@/lib/domain/graph/types";
import { drawMinimap, minimapToWorld } from "./draw";

// El minimapa. Dos cosas y solo dos: enseñar dónde estás dentro del grafo
// entero, y dejarte saltar a otro sitio con un clic.
//
// POR QUÉ NO REUTILIZA EL LIENZO PRINCIPAL EN PEQUEÑO
// Porque no dibuja lo mismo: aquí no hay etiquetas, ni aristas, ni selección,
// ni nivel de detalle. Dibujar el grafo completo en miniatura con toda la
// maquinaria del lienzo grande costaría lo mismo que un fotograma entero, sesenta
// veces por segundo, para enseñar una mancha de colores de doscientos píxeles.

const ANCHO = 200;
const ALTO = 140;

export default function Minimap({
  nodes, positions, version, viewport, bounds, onJump
}: {
  nodes: GraphNode[];
  positions: ReadonlyMap<string, NodePosition>;
  /**
   * Las posiciones viven en un ref del contenedor, así que su identidad no
   * cambia nunca y React no puede detectar que hay algo nuevo. Este contador
   * sube cuando se estabilizan y es lo que dispara el repintado.
   */
  version: number;
  viewport: Viewport;
  bounds: Rect | null;
  onJump(world: NodePosition): void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const colores = useRef<ColorTable>({});

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const tabla: ColorTable = {};
    for (const v of COLOR_VARS) tabla[v] = cs.getPropertyValue(v).trim();
    colores.current = tabla;
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || bounds === null) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = ANCHO * dpr;
    canvas.height = ALTO * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMinimap(ctx, { nodes, positions, colors: colores.current, viewport }, bounds, { width: ANCHO, height: ALTO });
  }, [nodes, positions, version, viewport, bounds]);

  if (bounds === null) return null;

  return (
    <canvas
      ref={ref}
      className="gr-minimap"
      style={{ width: ANCHO, height: ALTO }}
      aria-label="Mapa general del grafo"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onJump(minimapToWorld(
          { x: e.clientX - r.left, y: e.clientY - r.top },
          bounds,
          { width: ANCHO, height: ALTO }
        ));
      }}
    />
  );
}
