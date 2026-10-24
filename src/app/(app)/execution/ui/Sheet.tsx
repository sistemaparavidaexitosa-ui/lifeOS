"use client";

// La hoja de Execution: cajón inferior en el iPhone, panel lateral en escritorio.
//
// Una sola pieza para el detalle de tarea, los filtros y las acciones del
// proyecto, para que todo lo que «se abre» entre y salga igual.
//
// En el teléfono se cierra arrastrando hacia abajo desde la cabecera. No hace
// falta pasar un umbral: un tirón rápido basta (velocidad > 0,11 px/ms), como
// en Vaul. Hacia arriba no hay pared: hay fricción. El arrastre escribe el
// `transform` directamente en el elemento —nada de variables CSS, que
// recalcularían los estilos de todo el contenido en cada fotograma— y la
// transición se apaga mientras el dedo manda.
//
// La salida se anima: la hoja se queda montada hasta que termina su
// transición, y solo entonces desaparece del DOM.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";

const VELOCIDAD_CIERRE = 0.11;
const SALIDA_MS = 240;

export default function Sheet({
  open,
  onClose,
  title,
  titleHidden = false,
  headerExtra,
  children,
  footer,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  /** Nombre accesible y, salvo `titleHidden`, el título visible de la cabecera. */
  title: string;
  titleHidden?: boolean;
  /** Algo a la derecha del título, antes de cerrar (p. ej. el menú ⋯). */
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** `sm` para hojas de acciones cortas; `md` para el detalle. */
  size?: "sm" | "md";
}) {
  const [montada, setMontada] = useState(open);
  const [visible, setVisible] = useState(false);
  const hojaRef = useRef<HTMLDivElement>(null);
  const fondoRef = useRef<HTMLDivElement>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);
  const tituloId = useId();

  // Entrar: montar primero, pasar a «abierta» en el fotograma siguiente para
  // que la transición tenga un punto de partida. Salir: al revés.
  useEffect(() => {
    if (open) {
      focoPrevio.current = document.activeElement as HTMLElement | null;
      setMontada(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMontada(false), SALIDA_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!montada) return;
    const html = document.documentElement;
    const previo = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previo;
      focoPrevio.current?.focus?.({ preventScroll: true });
    };
  }, [montada]);

  useEffect(() => {
    if (visible) hojaRef.current?.focus({ preventScroll: true });
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const arrastre = useArrastre(hojaRef, fondoRef, onClose);

  if (!montada || typeof document === "undefined") return null;

  return createPortal(
    <div className="xr-sheet-root" data-state={visible ? "open" : "closed"}>
      <div ref={fondoRef} className="xr-sheet-fondo" onClick={onClose} aria-hidden />
      <div
        ref={hojaRef}
        className="xr-sheet"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
      >
        <div className="xr-sheet-cabeza" {...arrastre}>
          <span className="xr-sheet-asa" aria-hidden />
          <h2 id={tituloId} className={titleHidden ? "sr-only" : "xr-sheet-titulo"}>
            {title}
          </h2>
          {headerExtra}
          <button type="button" className="xr-icono-btn" onClick={onClose} aria-label="Cerrar">
            <IconClose width={18} height={18} />
          </button>
        </div>
        <div className="xr-sheet-cuerpo">{children}</div>
        {footer && <div className="xr-sheet-pie">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Arrastrar hacia abajo para cerrar, solo en el cajón (ancho de teléfono). */
function useArrastre(
  hojaRef: React.RefObject<HTMLDivElement | null>,
  fondoRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  const inicio = useRef<{ y: number; t: number; id: number } | null>(null);
  const delta = useRef(0);

  const esCajon = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Un segundo dedo a mitad del arrastre no debe hacer saltar la hoja.
    if (inicio.current || !esCajon()) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    inicio.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
    delta.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const hoja = hojaRef.current;
    if (hoja) hoja.style.transition = "none";
  }, [hojaRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const i = inicio.current;
    const hoja = hojaRef.current;
    if (!i || e.pointerId !== i.id || !hoja) return;
    const dy = e.clientY - i.y;
    // Hacia arriba, fricción creciente en vez de una pared.
    const y = dy >= 0 ? dy : -Math.sqrt(-dy) * 2;
    delta.current = dy;
    hoja.style.transform = `translate3d(0, ${y}px, 0)`;
    const fondo = fondoRef.current;
    if (fondo) fondo.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / hoja.offsetHeight));
  }, [hojaRef, fondoRef]);

  const terminar = useCallback((e: React.PointerEvent) => {
    const i = inicio.current;
    const hoja = hojaRef.current;
    if (!i || e.pointerId !== i.id) return;
    inicio.current = null;
    if (!hoja) return;
    const dy = delta.current;
    const velocidad = dy / Math.max(1, performance.now() - i.t);
    hoja.style.transition = "";
    const fondo = fondoRef.current;
    if (fondo) fondo.style.opacity = "";
    if (dy > hoja.offsetHeight * 0.3 || (dy > 10 && velocidad > VELOCIDAD_CIERRE)) {
      // Se sale desde donde la dejó el dedo, no desde arriba.
      hoja.style.transform = "";
      onClose();
    } else {
      hoja.style.transform = "";
    }
  }, [hojaRef, fondoRef, onClose]);

  return { onPointerDown, onPointerMove, onPointerUp: terminar, onPointerCancel: terminar };
}
