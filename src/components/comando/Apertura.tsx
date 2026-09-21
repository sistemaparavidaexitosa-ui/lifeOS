"use client";
// src/components/comando/Apertura.tsx
// Lo primero que el Centro te dice (D-179).
//
// LA FORMA ES LA DE UNA PREGUNTA, NO LA DE UN PÁRRAFO
// Grande va la PREGUNTA; el contexto queda debajo, pequeño, como apoyo. El
// primer intento las puso las dos grandes y la apertura se comía media
// pantalla: cuatro líneas de titular antes de poder ver una sola acción. Una
// pregunta que no cabe de un vistazo deja de ser una pregunta.
//
// POR QUÉ SE REVELA PALABRA A PALABRA
// No es adorno: es la diferencia entre «cargando» y «componiendo». El texto no
// llega de un modelo —lo calcula `voz.ts`, determinista— pero el sistema SÍ
// está pensando mientras tanto, esperando a `/api/centro`. El revelado hace
// visible ese trabajo en vez de dejar un hueco.
//
// Y SOLO SE TECLEA UNA VEZ. Cuando llegan los datos, `bloqueos` cambia y la
// pregunta puede pasar de «¿Planeamos mañana?» a «¿Quitamos lo que te frena?».
// Volver a teclear eso parpadea y parece un fallo; un fundido lo lee como lo
// que es: se lo pensó mejor al saber más.

import { useEffect, useRef, useState } from "react";
import type { Apertura as AperturaDelDominio } from "@/lib/domain/comando/voz.ts";

/** Milisegundos entre palabra y palabra. Más lento se siente lento. */
const PASO_MS = 45;

function Palabras({ texto, visibles }: { texto: string; visibles: number }) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  return (
    <>
      {palabras.map((palabra, i) => (
        <span className="centro-apertura-palabra" data-visible={i < visibles ? "true" : "false"} key={`${palabra}-${i}`}>
          {palabra}
          {i < palabras.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

export default function Apertura({
  apertura,
  pensando,
  resumen
}: {
  apertura: AperturaDelDominio;
  pensando: boolean;
  resumen: string;
}) {
  const palabras = apertura.pregunta.split(/\s+/).filter(Boolean).length;

  const [visibles, setVisibles] = useState(0);
  const [apoyoVisible, setApoyoVisible] = useState(false);
  // Si ya se tecleó una vez, un cambio de pregunta se cruza con un fundido.
  const yaSeRevelo = useRef(false);
  const [cambiando, setCambiando] = useState(false);

  useEffect(() => {
    if (!yaSeRevelo.current) {
      setVisibles(1);
      return;
    }
    // Segunda pregunta en adelante: fundido de salida y de entrada, sin teclear.
    setCambiando(true);
    const t = window.setTimeout(() => {
      setVisibles(palabras);
      setCambiando(false);
    }, 200);
    return () => window.clearTimeout(t);
  }, [apertura.pregunta, palabras]);

  useEffect(() => {
    if (visibles === 0 || visibles >= palabras) {
      if (visibles > 0 && visibles >= palabras) yaSeRevelo.current = true;
      return;
    }
    const t = window.setTimeout(() => setVisibles((n) => n + 1), PASO_MS);
    return () => window.clearTimeout(t);
  }, [palabras, visibles]);

  // El apoyo entra cuando la pregunta ya está entera: primero se pregunta,
  // luego se explica.
  useEffect(() => {
    if (visibles < palabras) return;
    const t = window.setTimeout(() => setApoyoVisible(true), 120);
    return () => window.clearTimeout(t);
  }, [palabras, visibles]);

  return (
    <section className="centro-apertura" aria-live="polite">
      <p className="rit-eyebrow centro-apertura-saludo">{apertura.saludo}</p>

      <p
        className="centro-apertura-pregunta"
        data-pensando={pensando ? "true" : "false"}
        data-cambiando={cambiando ? "true" : "false"}
      >
        <Palabras texto={apertura.pregunta} visibles={visibles} />
      </p>

      <p className="rit-muted centro-apertura-apoyo" data-visible={apoyoVisible ? "true" : "false"}>
        {apertura.contexto}
      </p>

      {/* Tres puntos, no un spinner: este repositorio no tiene ninguno y es
          deliberado. Solo mientras el sistema espera de verdad. */}
      {pensando && (
        <span className="centro-apertura-puntos" role="status" aria-label="Pensando">
          <i />
          <i />
          <i />
        </span>
      )}

      {/* Lo que el modelo sí sabe del día, cuando lo sabe. Vacío no se rellena. */}
      {resumen && (
        <p className="rit-muted centro-apertura-resumen" data-visible={apoyoVisible ? "true" : "false"}>
          {resumen}
        </p>
      )}
    </section>
  );
}
