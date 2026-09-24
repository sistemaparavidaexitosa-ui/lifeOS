"use client";

import { useEffect, useRef } from "react";
import type { AnySection, Screen } from "@/lib/domain/centro/runtime/types.ts";
import { eventosDeCierre, sinkNulo, type EventSink } from "@/lib/domain/centro/runtime/aprendizaje.ts";
import { registroDeSecciones } from "./index";

const SIN_COMPONENTE = "Esta parte todavía no tiene cómo mostrarse.";

/**
 * El renderer genérico del runtime (D-188).
 *
 * NO SABE DE NINGUNA PANTALLA. Recorre las secciones en el orden en que llegan
 * y le pide al registro el componente de cada `kind`; si no hay, pinta
 * `emptyState`. No hay un solo `if (kind === …)` aquí, y no debe haberlo.
 *
 * Emite los eventos de aprendizaje (abierta, tiempo, descartada, acción
 * aceptada) a `sink`, que en Fase 1 es `sinkNulo`.
 */
export default function RuntimeScreen({
  screen,
  onNavegar,
  sink = sinkNulo
}: {
  screen: Screen;
  /** Seguir un enlace cierra el Centro, igual que en el lienzo. */
  onNavegar: () => void;
  sink?: EventSink;
}) {
  const aceptoAlgo = useRef(false);

  useEffect(() => {
    const abiertaEn = Date.now();
    const base = { screenId: screen.id, intentKind: screen.intent };
    sink.emitir({ ...base, tipo: "abierta", en: new Date(abiertaEn).toISOString() });
    return () => {
      for (const e of eventosDeCierre({ ...base, abiertaEn, cerradaEn: Date.now(), aceptoAlgo: aceptoAlgo.current })) {
        sink.emitir(e);
      }
    };
  }, [screen.id, screen.intent, sink]);

  function alAceptar(kind: AnySection["kind"]) {
    return (href: string) => {
      aceptoAlgo.current = true;
      sink.emitir({
        screenId: screen.id,
        intentKind: screen.intent,
        en: new Date().toISOString(),
        tipo: "accionAceptada",
        sectionKind: kind,
        href
      });
      onNavegar();
    };
  }

  return (
    <div className="rt-screen" data-densidad={screen.layout.densidad}>
      {screen.sections.map((s) => (
        <Seccion key={s.id} seccion={s} alAceptar={alAceptar(s.kind)} />
      ))}
    </div>
  );
}

function Seccion({ seccion, alAceptar }: { seccion: AnySection; alAceptar: (href: string) => void }) {
  const Componente = registroDeSecciones.componenteDe(seccion.kind);
  if (!Componente) {
    const Vacia = registroDeSecciones.componenteDe("emptyState");
    return Vacia ? (
      <section className="rt-seccion" data-kind="emptyState">
        <Vacia data={{ mensaje: SIN_COMPONENTE }} title={seccion.title} alAceptar={alAceptar} />
      </section>
    ) : null;
  }
  return (
    <section className="rt-seccion" data-kind={seccion.kind}>
      {/* El validador del servidor comprobó la pareja kind↔datos; TypeScript
          no puede seguirla a través de la unión, de ahí el cast. */}
      <Componente data={seccion.data as never} title={seccion.title} alAceptar={alAceptar} />
    </section>
  );
}
