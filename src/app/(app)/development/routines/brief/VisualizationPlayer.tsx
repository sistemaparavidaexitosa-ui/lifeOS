"use client";

import { useEffect, useState } from "react";
import type { BriefView } from "@/lib/identity/brief-view";

/**
 * La visualización guiada: un paso a la vez, con su tiempo.
 *
 * No graba nada ni suena: es un temporizador que avanza solo y se puede
 * pausar o saltar. Con `prefers-reduced-motion` la barra no se anima, solo
 * cambia el número. Sin JavaScript (o antes de empezar) los pasos se leen en
 * lista, que es también su vista accesible.
 */
export default function VisualizationPlayer({ visualization }: { visualization: BriefView["visualization"] }) {
  const pasos = visualization.steps;
  const [paso, setPaso] = useState<number | null>(null);
  const [restante, setRestante] = useState(0);
  const [pausa, setPausa] = useState(false);

  useEffect(() => {
    if (paso === null || pausa) return;
    if (restante <= 0) {
      if (paso + 1 < pasos.length) {
        setPaso(paso + 1);
        setRestante(pasos[paso + 1]!.seconds);
      } else {
        setPaso(null);
      }
      return;
    }
    const t = setTimeout(() => setRestante((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [paso, restante, pausa, pasos]);

  function empezar() {
    setPaso(0);
    setRestante(pasos[0]?.seconds ?? 0);
    setPausa(false);
  }

  if (paso === null) {
    return (
      <div className="flex flex-col gap-3">
        <ol className="flex flex-col gap-1.5 text-sm list-decimal pl-5" style={{ color: "var(--muted)" }}>
          {pasos.map((p, i) => (
            <li key={i}>{p.text}</li>
          ))}
        </ol>
        <button type="button" className="btn-primary btn-sm self-start" onClick={empezar} disabled={!pasos.length}>
          Empezar · {visualization.durationMin} min
        </button>
      </div>
    );
  }

  const actual = pasos[paso]!;
  const avance = actual.seconds ? ((actual.seconds - restante) / actual.seconds) * 100 : 100;

  // CUÁNTO FALTA EN TOTAL, y no solo del paso. Con cuatro pasos, «Paso 2 de 4»
  // bastaba para hacerse una idea. Con nueve, saber que quedan doce segundos
  // del paso actual no dice nada sobre si esto acaba pronto o dentro de cuatro
  // minutos — y esa incertidumbre es justo lo que saca a alguien de una
  // visualización.
  const restanteTotal = restante + pasos.slice(paso + 1).reduce((s, p) => s + p.seconds, 0);
  const minutos = Math.floor(restanteTotal / 60);
  const segundos = restanteTotal % 60;

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
        Paso {paso + 1} de {pasos.length} · quedan {minutos}:{String(segundos).padStart(2, "0")}
      </span>
      <p className="text-base leading-relaxed">{actual.text}</p>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${avance}%`, transition: "width 1s linear" }} />
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setPausa((p) => !p)}>
          {pausa ? "Seguir" : "Pausa"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setRestante(0)}>
          Siguiente
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setPaso(null)}>
          Terminar
        </button>
      </div>
    </div>
  );
}
