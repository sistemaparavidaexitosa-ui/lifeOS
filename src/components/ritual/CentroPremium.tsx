"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fdate, money0 } from "@/lib/format";
import { NAV_ITEMS } from "@/components/nav-items";
import HabitCheckbox from "@/components/habits/HabitCheckbox";
import { abrirFoco, atraparFoco } from "@/lib/dom/ritual-focus.ts";
import { temaDelRitual } from "@/lib/domain/ritual/tema.ts";
import { componerCentro, type BloqueCentro } from "@/lib/domain/centro/componer.ts";
import { destinosDelCentro } from "@/lib/domain/centro/destinos.ts";
import { destacadosDelCentro } from "@/lib/domain/centro/destacados.ts";
import type { ContenidoDelRitual } from "@/lib/data/ritual";
import type { HabitLogEntry } from "@/lib/domain/development/habit-analytics.ts";
import type { HechoRitual } from "@/lib/domain/ritual/types.ts";
import type { SugerenciaView } from "@/lib/centro/sugerencias";
import Sugerencias from "./Sugerencias";

/**
 * El centro premium (D-166): la puerta de la aplicación.
 *
 * PINTA EL SALUDO Y LOS DESTINOS AL INSTANTE, con lo que ya trae la puerta del
 * layout, y pide el resto a `/api/centro`. Es lo que evita que el centro se
 * sienta lento: para navegar —que es su trabajo principal— no hace falta
 * esperar a nada.
 *
 * Y por eso mismo, si esa petición falla, el centro NO se rompe: se queda sin
 * los bloques del día y sigue siendo un menú perfectamente utilizable.
 */
export default function CentroPremium({
  cabecera,
  hourLocal,
  currency,
  locale,
  onCerrar,
  onIrA,
  onHabitual,
  onRepetirRitual,
  workspaceId
}: {
  cabecera: { saludo: string; nombre: string; dateISO: string };
  hourLocal: number;
  currency: string;
  locale: string;
  /** Escape o «Ahora no»: cierra el centro esta vez. */
  onCerrar: () => void;
  /** Se eligió un destino: el centro se cierra y el enlace navega. */
  onIrA: () => void;
  onHabitual: () => void;
  /** `null` si la política no permite el ritual: entonces no se ofrece repetirlo. */
  onRepetirRitual: (() => void) | null;
  /** Donde se crean las tareas que se acepten desde una sugerencia. */
  workspaceId: string | null;
}) {
  const [contenido, setContenido] = useState<ContenidoDelRitual | null>(null);
  const [sugerencias, setSugerencias] = useState<SugerenciaView[]>([]);
  const [resumen, setResumen] = useState("");
  const [marcados, setMarcados] = useState<Record<string, HabitLogEntry | null>>({});
  const shellRef = useRef<HTMLDivElement | null>(null);

  const grupos = useMemo(() => destinosDelCentro(NAV_ITEMS), []);
  // Sin IA y al vuelo: en cuanto llega el contenido, la fila ya está.
  const destacados = useMemo(
    () => (contenido ? destacadosDelCentro(contenido.senales, sugerencias.map((s) => s.href ?? "")) : []),
    [contenido, sugerencias]
  );
  const bloques: BloqueCentro[] = useMemo(() => (contenido ? componerCentro(contenido) : []), [contenido]);
  const tema = temaDelRitual(hourLocal);

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

  function valor(h: HechoRitual): string {
    if (h.unidad === "moneda") return money0(h.valor, currency, locale);
    if (h.unidad === "porcentaje") return `${h.valor}%`;
    if (h.unidad === "minutos") return `${h.valor} min`;
    return String(h.valor);
  }

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
          {fdate(cabecera.dateISO, locale)}
        </span>
        <button className="rit-skip" onClick={onCerrar}>
          Ahora no
        </button>
      </div>

      <div className="rit-main" style={{ justifyContent: "flex-start", paddingTop: 12 }}>
        <div className="rit-centro">
          <h2 className="rit-title" tabIndex={-1} data-ritual-title>
            {cabecera.saludo}, {cabecera.nombre}.
          </h2>

          {/* El «cómo voy» va pegado al saludo: es lo primero que se lee, y sin
              él la pantalla daba cifras sin contar nada. Si está vacío no se
              pinta: un hueco bajo el titular se lee como un error de carga. */}
          {resumen && <p className="rit-lead">{resumen}</p>}

          {bloques.length > 0 && (
            <div className="rit-centro-bloques">
              {bloques.map((b) => {
                if (b.kind === "ahora") {
                  return (
                    <div key="ahora">
                      <p className="rit-eyebrow">Ahora · {b.paso.routineName}</p>
                      <div className="rit-habit">
                        <HabitCheckbox
                          routineId={b.paso.routineId}
                          habitId={b.paso.habit.id}
                          today={cabecera.dateISO}
                          entry={marcados[b.paso.habit.id] ?? null}
                          size={56}
                          onResult={(nuevo) => setMarcados((m) => ({ ...m, [b.paso.habit.id]: nuevo }))}
                        />
                        <div className="min-w-0">
                          <p className="rit-lead">{b.paso.habit.name}</p>
                          <p className="rit-muted">{b.paso.habit.durationMin} min</p>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (b.kind === "dia") {
                  return (
                    <div key="dia">
                      <p className="rit-eyebrow">Tu día</p>
                      <div className="rit-facts">
                        {b.hechos.map((h) => (
                          <div key={h.id} className="rit-fact" data-tono={h.tono}>
                            <b>{valor(h)}</b>
                            <span>{h.etiqueta}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key="mueve">
                    <p className="rit-eyebrow">Lo que mueve el día</p>
                    <p className="rit-lead">{b.oneThing}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* «Sigue por aquí»: los destinos que hoy importan, deducidos de tu
              actividad. Van encima de la lista completa, que no se mueve. */}
          {destacados.length > 0 && (
            <div>
              <p className="rit-eyebrow">Sigue por aquí</p>
              <div className="rit-destacados">
                {destacados.map((d) => (
                  <Link key={d.href} href={d.href} className="rit-destacado" onClick={onIrA}>
                    <b>{d.label}</b>
                    <span>{d.motivo}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Lo que la IA propone va ENCIMA de los destinos, porque es lo que
              cambia cada día; la lista de módulos siempre está donde estaba. */}
          {/* Se monta SOLO cuando ya hay sugerencias, y no antes con una lista
              vacía: `Sugerencias` guarda la suya en estado propio para poder
              quitar una al descartarla, y un `useState(props)` se queda con el
              primer valor —el vacío— aunque después lleguen. Montarlo con los
              datos ya puestos es lo que evita esa clase de bug. */}
          {sugerencias.length > 0 && (
            <Sugerencias iniciales={sugerencias} workspaceId={workspaceId} onNavegar={onIrA} />
          )}

          <div>
            <p className="rit-eyebrow" style={{ marginBottom: 14 }}>
              A dónde vas
            </p>
            {grupos.map((g) => (
              <div key={g.grupo}>
                <h3 className="rit-centro-grupo">{g.grupo}</h3>
                <div className="rit-centro-destinos">
                  {g.destinos.map((d) => (
                    <Link key={d.href} href={d.href} className="rit-centro-destino" onClick={onIrA}>
                      {d.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

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
    </div>
  );
}
