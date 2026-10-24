"use client";

// Avisos de Execution, al estilo Sonner: `aviso()` desde cualquier sitio y un
// `<Avisos />` montado una vez en la página.
//
// Existen sobre todo para «Deshacer»: marcar una tarea no pregunta nada, pero
// deja unos segundos para arrepentirse. Detalles que nadie nota y que sí
// importan: el temporizador se detiene con la pestaña oculta y mientras el
// dedo o el ratón están encima; un aviso con la misma clave sustituye al
// anterior en vez de apilarse (tocar el círculo tres veces es UN aviso que se
// actualiza); la salida es más rápida que la entrada.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export interface Aviso {
  id: string;
  mensaje: string;
  detalle?: string;
  tono?: "normal" | "error";
  accion?: { etiqueta: string; alPulsar: () => void };
  /** ms en pantalla; por defecto 4 s (6 s si es un error). */
  duracion?: number;
}

type Estado = (Aviso & { saliendo?: boolean; version: number })[];

let avisos: Estado = [];
const oyentes = new Set<() => void>();
let contador = 0;

function emitir(siguiente: Estado) {
  avisos = siguiente;
  oyentes.forEach((o) => o());
}

export function aviso(a: Omit<Aviso, "id"> & { id?: string }): string {
  const id = a.id ?? `aviso-${++contador}`;
  const existente = avisos.find((x) => x.id === id);
  const nuevo = { ...a, id, version: (existente?.version ?? 0) + 1 };
  emitir(existente ? avisos.map((x) => (x.id === id ? nuevo : x)) : [...avisos, nuevo].slice(-3));
  return id;
}

export function cerrarAviso(id: string) {
  if (!avisos.some((x) => x.id === id)) return;
  emitir(avisos.map((x) => (x.id === id ? { ...x, saliendo: true } : x)));
  window.setTimeout(() => emitir(avisos.filter((x) => x.id !== id)), 180);
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

const SIN_AVISOS: Estado = [];

export default function Avisos() {
  const lista = useSyncExternalStore(suscribir, () => avisos, () => SIN_AVISOS);
  // En <body>: dentro de la página, cualquier contenedor con su propio
  // contexto de apilamiento lo dejaba debajo de la barra inferior.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  return createPortal(
    <ol className="xr-avisos" aria-live="polite">
      {lista.map((a, i) => (
        <AvisoItem key={a.id} a={a} profundidad={lista.length - 1 - i} />
      ))}
    </ol>,
    document.body
  );
}

function AvisoItem({ a, profundidad }: { a: Estado[number]; profundidad: number }) {
  const [montado, setMontado] = useState(false);
  const restante = useRef(a.duracion ?? (a.tono === "error" ? 6000 : 4000));
  const pausado = useRef(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMontado(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Cada versión nueva del mismo aviso reinicia su tiempo.
  useEffect(() => {
    restante.current = a.duracion ?? (a.tono === "error" ? 6000 : 4000);
  }, [a.version, a.duracion, a.tono]);

  useEffect(() => {
    let ultimo = performance.now();
    const tick = window.setInterval(() => {
      const ahora = performance.now();
      if (!pausado.current && document.visibilityState === "visible") restante.current -= ahora - ultimo;
      ultimo = ahora;
      if (restante.current <= 0) {
        window.clearInterval(tick);
        cerrarAviso(a.id);
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [a.id, a.version]);

  return (
    <li
      className="xr-aviso"
      data-montado={montado || undefined}
      data-saliendo={a.saliendo || undefined}
      data-tono={a.tono ?? "normal"}
      style={{ "--prof": profundidad } as React.CSSProperties}
      onPointerEnter={() => (pausado.current = true)}
      onPointerLeave={() => (pausado.current = false)}
      role={a.tono === "error" ? "alert" : "status"}
    >
      <span className="xr-aviso-texto">
        <span className="xr-aviso-mensaje">{a.mensaje}</span>
        {a.detalle && <span className="xr-aviso-detalle">{a.detalle}</span>}
      </span>
      {a.accion && (
        <button
          type="button"
          className="xr-aviso-accion"
          onClick={() => {
            a.accion?.alPulsar();
            cerrarAviso(a.id);
          }}
        >
          {a.accion.etiqueta}
        </button>
      )}
    </li>
  );
}
