"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Superficie de menú anclada a su disparador.
 *
 * POR QUÉ EXISTE
 * Cada popover del tablero (estado, prioridad, fechas, responsables, color de
 * grupo) traía su propio `position: absolute; top: 34px` y su propio z-index a
 * mano (45 aquí, 40 allá, 46 más allá). Eso daba tres problemas reales:
 *
 *   1. Abrían SIEMPRE hacia abajo. En la última fila de un tablero largo el
 *      menú nacía fuera de la pantalla y no había forma de alcanzarlo.
 *   2. `absolute` se recorta contra cualquier ancestro con overflow. El
 *      navegador de tableros y el cuerpo del drawer lo tienen.
 *   3. Los z-index sueltos no formaban ningún orden: quién tapaba a quién
 *      dependía del número que le tocó a cada componente.
 *
 * La solución es `position: fixed` calculado desde el rect del disparador, con
 * volteo arriba/abajo y recorte contra los bordes de la ventana. Al ser fixed,
 * ningún overflow lo recorta, y el z-index sale de la escala de globals.css
 * (--z-popover), no de un número inventado en cada archivo.
 */
export type MenuAlign = "start" | "center" | "end";

const MARGIN = 8;
const GAP = 6;

export default function MenuSurface({
  anchor,
  onClose,
  align = "center",
  width,
  className = "",
  label,
  children
}: {
  /** Elemento al que se ancla: normalmente el botón que abrió el menú. */
  anchor: HTMLElement | null;
  onClose: () => void;
  align?: MenuAlign;
  /** Ancho fijo en px. Sin él, el menú se ajusta a su contenido. */
  width?: number;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "top" | "bottom" } | null>(null);

  const place = useCallback(() => {
    const surface = surfaceRef.current;
    if (!anchor || !surface) return;
    const a = anchor.getBoundingClientRect();
    const s = surface.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Abajo por defecto; arriba solo si allí no cabe y arriba sí.
    const roomBelow = vh - a.bottom - GAP - MARGIN;
    const roomAbove = a.top - GAP - MARGIN;
    const placement: "top" | "bottom" = s.height > roomBelow && roomAbove > roomBelow ? "top" : "bottom";
    const top = placement === "bottom" ? a.bottom + GAP : Math.max(MARGIN, a.top - GAP - s.height);

    const raw =
      align === "start" ? a.left : align === "end" ? a.right - s.width : a.left + a.width / 2 - s.width / 2;
    // Clamp horizontal: en móvil un menú de 220px anclado al borde derecho se
    // salía de la pantalla y arrastraba scroll horizontal a toda la página.
    const left = Math.min(Math.max(MARGIN, raw), Math.max(MARGIN, vw - s.width - MARGIN));

    setPos({ top, left, placement });
  }, [anchor, align]);

  // useLayoutEffect: se posiciona ANTES de pintar, así no se ve el salto desde
  // la esquina superior izquierda hasta su sitio definitivo.
  useLayoutEffect(place, [place]);

  /**
   * Reposicionar cuando cambia el TAMAÑO del menú, no solo cuando se mueve el
   * ancla.
   *
   * Los popovers del tablero tienen contenido de altura fija, así que colocar
   * una vez bastaba. El menú de menciones no: pasa de seis candidatos a uno
   * mientras escribes, y con `data-placement="top"` la posición es
   * `a.top - GAP - s.height` — depende de la altura. Sin esto, el menú
   * conservaba el `top` calculado para la altura anterior y quedaba flotando
   * separado del campo. Se veía sobre todo en el teléfono, porque allí el
   * campo está al final de un hilo largo y casi siempre voltea hacia arriba.
   */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === "undefined") return;
    // Reposicionar no cambia el tamaño (el alto sale del contenido y el ancho
    // es una prop), así que esto no puede realimentarse.
    const observer = new ResizeObserver(place);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [place]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // `true` para capturar también el scroll de contenedores internos, no solo
    // el de la ventana: el tablero scrollea dentro de su propio panel.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("keydown", onKey);
    };
  }, [place, onClose]);

  return (
    <>
      <div className="ex-backdrop" onClick={onClose} />
      <div
        ref={surfaceRef}
        role="menu"
        aria-label={label}
        className={`ex-menu ${className}`}
        data-placement={pos?.placement ?? "bottom"}
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          width,
          // Hasta tener medida no se pinta: evita el parpadeo en la esquina.
          visibility: pos ? "visible" : "hidden"
        }}
      >
        {children}
      </div>
    </>
  );
}

/** Estado mínimo que necesita un disparador de menú: abierto + su elemento. */
export function useMenuAnchor() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const toggle = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    setAnchor((prev) => (prev ? null : el));
  }, []);
  const close = useCallback(() => setAnchor(null), []);
  return { anchor, open: anchor !== null, toggle, close };
}
