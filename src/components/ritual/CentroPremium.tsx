"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fdate } from "@/lib/format";
import { abrirFoco, atraparFoco } from "@/lib/dom/ritual-focus.ts";
import { temaDelRitual } from "@/lib/domain/ritual/tema.ts";
import { construirSecuencia } from "@/lib/domain/ritual/secuencia.ts";
import { franjaDeHoy } from "@/lib/domain/centro/franja.ts";
import type { EntradaDeMando } from "@/lib/domain/comando/componer.ts";
import type { ContenidoDelRitual } from "@/lib/data/ritual";
import type { SugerenciaView } from "@/lib/centro/sugerencias";
import Navegacion from "@/components/comando/Navegacion";
import BarraCaptura from "./BarraCaptura";

/**
 * El centro (D-166 a D-169): la puerta de LifeOS.
 *
 * DEJÓ DE SER UN MENÚ. Enseñaba 23 destinos, una rejilla de cifras y unas
 * líneas de lo que la IA deducía; aunque la IA acertara, se leía como un panel
 * con un widget encima. Ahora la pantalla entera es lo derivado: UNA cosa que
 * hacer, con su porqué, y la barra para decir otra. Para navegar está la barra
 * lateral, que nunca se tocó, y «Ahora no» cierra en un toque.
 *
 * Este componente es solo el armazón —saludo, lienzo, barra, pie— y no decide
 * nada: qué se enseña lo decide `tarjetasDelCentro`, que es pura y está probada.
 */
export default function CentroPremium({
  cabecera,
  hourLocal,
  locale,
  workspaceId,
  onCerrar,
  onIrA,
  onHabitual,
  onRepetirRitual
}: {
  cabecera: { saludo: string; nombre: string; dateISO: string };
  hourLocal: number;
  locale: string;
  workspaceId: string | null;
  onCerrar: () => void;
  onIrA: () => void;
  onHabitual: () => void;
  /** `null` si la política no permite el ritual: entonces no se ofrece repetirlo. */
  onRepetirRitual: (() => void) | null;
}) {
  const [contenido, setContenido] = useState<ContenidoDelRitual | null>(null);
  const [sugerencias, setSugerencias] = useState<SugerenciaView[]>([]);
  const [resumen, setResumen] = useState("");
  const shellRef = useRef<HTMLDivElement | null>(null);
  const tema = temaDelRitual(hourLocal);
  const diaSemana = new Date(`${cabecera.dateISO}T00:00:00Z`).getUTCDay();
  const franja = franjaDeHoy(hourLocal);

  useEffect(() => {
    let vivo = true;
    void fetch("/api/centro")
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ contenido: ContenidoDelRitual; sugerencias?: SugerenciaView[]; resumen?: string }>)
          : null
      )
      .catch(() => null)
      .then((r) => {
        if (!vivo || !r) return;
        if (r.contenido) setContenido(r.contenido);
        if (r.sugerencias?.length) setSugerencias(r.sugerencias);
        if (r.resumen) setResumen(r.resumen);
      });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    return abrirFoco(el);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCerrar();
        return;
      }
      const el = shellRef.current;
      if (el) atraparFoco(el, e);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // La app de debajo deja de alcanzarse con el teclado y el lector de pantalla
  // mientras el centro está encima. Mismo criterio que el ritual.
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("body > div");
    if (!main) return;
    main.setAttribute("inert", "");
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      main.removeAttribute("inert");
      document.body.style.overflow = previo;
    };
  }, []);

  /**
   * De lo que llegó a lo que el lienzo necesita.
   *
   * El hábito sale de `construirSecuencia` acotada al paso de rutina: así
   * hereda la regla de la hora de D-165 —una rutina de la noche no se propone
   * por la mañana— en vez de escribir una segunda versión de ella.
   */
  const entrada: EntradaDeMando | null = useMemo(() => {
    if (!contenido) return null;
    const pasos = construirSecuencia({
      ...contenido,
      settings: { ...contenido.settings, steps: ["routineStep"], maxRoutineSteps: 1 }
    });
    const paso = pasos.find((p) => p.kind === "routineStep");

    return {
      resumen,
      proximoHabito:
        paso && paso.kind === "routineStep"
          ? {
              routineId: paso.routineId,
              routineName: paso.routineName,
              habitId: paso.habit.id,
              nombre: paso.habit.name,
              durationMin: paso.habit.durationMin
            }
          : null,
      propuestas: sugerencias.map((s) => ({
        id: s.id,
        tipo: s.tipo,
        titulo: s.titulo,
        motivo: s.motivo || s.detalle,
        href: s.href
      })),
      unicaCosa: contenido.plan?.oneThing ?? null,
      vencidas: contenido.senales.vencidas,
      diasParaFinDeQuincena: contenido.senales.diasParaFinDeQuincena,
      presupuestoEnRojo: contenido.senales.presupuestoEnRojo,

      // Lo que la cabecera del centro no usaba y los carriles sí (D-177). Nada
      // de esto es una consulta nueva: son cifras que `loadRitualContent` ya
      // trae en la misma pasada.
      senalesDeCarril: {
        tareasDelPlan: contenido.plan?.tareas.length ?? 0,
        // TODOS los hábitos pendientes de hoy, no solo el que toca ahora: el
        // carril dice cómo va el frente, y para eso «te quedan tres» informa y
        // «te queda el de las siete» no.
        habitosPendientes: construirSecuencia({
          ...contenido,
          settings: { ...contenido.settings, steps: ["routineStep"], maxRoutineSteps: 99 }
        }).filter((x) => x.kind === "routineStep").length,
        identidadDeclarada: Boolean(contenido.identidadDeclarada)
      }
    };
  }, [contenido, sugerencias, resumen]);

  return (
    <div
      ref={shellRef}
      className="rit-shell"
      data-ritual-theme={tema}
      role="dialog"
      aria-modal="true"
      aria-label="Centro"
    >
      <div className="rit-top">
        <span className="rit-muted" style={{ fontSize: 13 }}>
          {cabecera.saludo}, {cabecera.nombre} · {fdate(cabecera.dateISO, locale)}
        </span>
        {/* «Cerrar», no «Ahora no»: dentro de una tarjeta «Ahora no» significa
            apartarla, y dos botones con la misma etiqueta y distinto efecto en
            la misma pantalla es una trampa. Lo encontró la prueba de navegador
            tropezando con ella. */}
        <button className="rit-skip" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div className="rit-main">
        <Navegacion
          entrada={entrada}
          today={cabecera.dateISO}
          nombre={cabecera.nombre}
          diaSemana={diaSemana}
          franja={franja}
          pensando={!contenido}
          workspaceId={workspaceId}
          onNavegar={onIrA}
        />
      </div>

      <div className="rit-bottom">
        <BarraCaptura workspaceId={workspaceId} onNavegar={onIrA} />

        <div className="rit-centro-pie">
          {onRepetirRitual && (
            <button className="rit-skip" onClick={onRepetirRitual}>
              Repetir el ritual de hoy
            </button>
          )}
          <Link href="/settings" className="rit-skip" onClick={onIrA} style={{ textDecoration: "underline" }}>
            Configuración
          </Link>
          <button className="rit-skip" onClick={onHabitual}>
            Navegación habitual
          </button>
        </div>
      </div>
    </div>
  );
}
