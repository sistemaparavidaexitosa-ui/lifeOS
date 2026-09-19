"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HabitLogEntry } from "@/lib/domain/development/habit-analytics.ts";
import { abrirFoco, atraparFoco } from "@/lib/dom/ritual-focus.ts";
import { construirSecuencia, progreso, pasoSiguiente, type EntradaSecuencia } from "@/lib/domain/ritual/secuencia.ts";
import { temaDelRitual } from "@/lib/domain/ritual/tema.ts";
import { startRitual, advanceRitual, skipRitual, completeRitual } from "@/lib/ritual/actions";
import type { ActionResult } from "@/lib/supabase/errors";
import type { BriefView } from "@/lib/identity/brief-view";
import RitualStep from "./RitualStep";

/**
 * La capa del arranque guiado (D-165).
 *
 * LA SECUENCIA SE CONSTRUYE AQUÍ, EN EL CLIENTE, y no llega hecha desde el
 * servidor. No es un capricho: `construirSecuencia()` es pura y no importa nada
 * del servidor, así que cuando el respaldo del brief resuelve —segundos después
 * de montar— basta con meter el brief en la entrada y volver a llamarla para que
 * los pasos de identidad aparezcan en su sitio. La alternativa era pedir la
 * pantalla entera otra vez con la persona delante.
 *
 * LA SECUENCIA NO CAMBIA BAJO EL DEDO. Dos cosas podrían moverla a mitad del
 * recorrido, y ninguna lo hace:
 *
 *  · Marcar un hábito NO lo saca de la secuencia. Sacarlo parecía lo coherente
 *    —ya no está pendiente— y era un fallo: el paso desaparecía al tocar la
 *    casilla y el índice pasaba a apuntar al siguiente, así que la persona nunca
 *    veía su hábito en verde. Lo marcado se recuerda en `marcados` y se le
 *    devuelve al paso si vuelve a pintarse.
 *  · El brief que llega tarde solo se inserta si la persona sigue en el saludo.
 *    Los pasos de identidad van justo detrás del saludo; insertarlos cuando ya
 *    está más adelante desplazaría todos los índices y cambiaría el paso que
 *    tiene delante. Si llega tarde, queda guardado y se ve en Rutinas.
 */
export default function RitualOverlay({
  entrada,
  blocking,
  identidadDeclarada,
  hayBriefDeHoy,
  briefIntentadoHoy,
  currency,
  locale,
  alCentro
}: {
  entrada: EntradaSecuencia;
  blocking: boolean;
  identidadDeclarada: string | null;
  hayBriefDeHoy: boolean;
  briefIntentadoHoy: boolean;
  currency: string;
  locale: string;
  /**
   * En navegación premium (D-166), terminar u omitir el ritual deja en el
   * centro, que es la puerta de la aplicación. Sin esta prop —modo habitual— el
   * cierre es el de D-165: una pregunta y sus enlaces.
   */
  alCentro?: () => void;
}) {
  const [abierto, setAbierto] = useState(true);
  const [indice, setIndice] = useState(0);
  const [marcados, setMarcados] = useState<Record<string, HabitLogEntry | null>>({});
  const [brief, setBrief] = useState(entrada.brief);
  const [pidiendoBrief, setPidiendoBrief] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  const pasos = useMemo(() => construirSecuencia({ ...entrada, brief }), [entrada, brief]);

  // El índice vive también en una ref para que la respuesta del brief, que
  // llega en una promesa creada al montar, lea el valor de AHORA y no el de
  // entonces.
  const indiceRef = useRef(0);
  indiceRef.current = indice;

  const paso = pasos[Math.min(indice, Math.max(pasos.length - 1, 0))];
  const { actual, total, pct } = progreso(pasos, indice);
  const esUltimo = pasoSiguiente(pasos, indice) === null;
  const tema = temaDelRitual(entrada.hourLocal);

  // La marca de «ya se mostró hoy» se escribe al MONTAR, no al cerrar:
  // «primera sesión del día» es literalmente eso. El coste conocido —abrir y
  // cerrar la pestaña consume el arranque— está aceptado por escrito.
  useEffect(() => {
    void startRitual(pasos.length);
    // Solo al montar: `pasos.length` puede cambiar si llega el brief, y volver a
    // llamar aquí reescribiría el total en cada recálculo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * El respaldo del brief. Se dispara al montar y NO bloquea: el saludo ya está
   * en pantalla y se lee en varios segundos, que es justo el presupuesto que
   * necesita la cadena agente → respaldo.
   */
  useEffect(() => {
    if (hayBriefDeHoy || briefIntentadoHoy || !entrada.settings.aiEnabled) return;
    let vivo = true;
    setPidiendoBrief(true);
    // Por `fetch` y NO como Server Action: Next ejecuta las Server Actions de un
    // cliente EN FILA, y esta puede tardar treinta segundos. Como acción, marcar
    // el hábito u omitir quedaban esperando detrás del modelo (ver la ruta).
    void fetch("/api/ritual/brief", { method: "POST" })
      .then((res) => res.json() as Promise<ActionResult & { brief?: BriefView }>)
      .catch((): ActionResult & { brief?: BriefView } => ({ ok: false, reason: "Sin conexión." }))
      .then((r) => {
      if (!vivo) return;
      setPidiendoBrief(false);
      if (r.ok && r.brief && indiceRef.current === 0) {
        setBrief({
          id: r.brief.id,
          affirmations: r.brief.affirmations.map((a) => ({ id: a.id, text: a.text, category: a.category })),
          mantra: r.brief.mantra,
          visualization: r.brief.visualization
            ? {
                title: r.brief.visualization.title,
                durationMin: r.brief.visualization.durationMin,
                steps: r.brief.visualization.steps
              }
            : null,
          dailyAction: r.brief.dailyAction ? { text: r.brief.dailyAction.text, done: r.brief.actionDone } : null
        });
      }
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cerrar = useCallback(
    (motivo: "omitido" | "terminado") => {
      setAbierto(false);
      if (motivo === "omitido") void skipRitual(paso?.kind ?? "", actual);
      else void completeRitual(total);
      alCentro?.();
    },
    [paso?.kind, actual, total, alCentro]
  );

  // Foco: al abrir va al título del paso; al cerrar vuelve a donde estaba. Sin
  // esto, quien navega con teclado acaba al principio del documento y tiene que
  // recorrer la aplicación entera para volver a donde iba.
  useEffect(() => {
    const el = shellRef.current;
    if (!el || !abierto) return;
    const restaurar = abrirFoco(el);
    return restaurar;
  }, [abierto]);

  // Al cambiar de paso, el foco va al titular nuevo: es lo que hace que un
  // lector de pantalla lea el paso en lugar de quedarse callado.
  useEffect(() => {
    if (!abierto) return;
    shellRef.current?.querySelector<HTMLElement>("[data-ritual-title]")?.focus();
  }, [indice, abierto]);

  useEffect(() => {
    if (!abierto) return;
    function onKey(e: KeyboardEvent) {
      // Escape siempre sale. Un ritual que no se puede saltar deja de ser un
      // ritual y se vuelve un peaje — y `blocking` no puede cambiar eso.
      if (e.key === "Escape") {
        e.preventDefault();
        cerrar("omitido");
        return;
      }
      const el = shellRef.current;
      if (el) atraparFoco(el, e);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto, cerrar]);

  // El resto de la aplicación deja de ser alcanzable con el teclado y para los
  // lectores de pantalla mientras la capa esté encima.
  useEffect(() => {
    if (!abierto || !blocking) return;
    const main = document.querySelector<HTMLElement>("body > div");
    if (!main) return;
    main.setAttribute("inert", "");
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      main.removeAttribute("inert");
      document.body.style.overflow = previo;
    };
  }, [abierto, blocking]);

  if (!abierto || pasos.length === 0 || !paso) return null;

  function avanzar() {
    const siguiente = pasoSiguiente(pasos, indice);
    if (siguiente === null) {
      cerrar("terminado");
      return;
    }
    setIndice(siguiente);
    void advanceRitual(pasos[siguiente]?.kind ?? "", siguiente + 1);
  }

  return (
    <div
      ref={shellRef}
      className="rit-shell"
      data-ritual-theme={tema}
      role="dialog"
      aria-modal="true"
      aria-label="Arranque del día"
    >
      <div className="rit-top">
        <div className="rit-progress" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
        <span className="rit-muted" style={{ fontSize: 13, flexShrink: 0 }}>
          {actual}/{total}
        </span>
        <button className="rit-skip" onClick={() => cerrar("omitido")}>
          Ahora no
        </button>
      </div>

      <div className="rit-main">
        <RitualStep
          key={indice}
          paso={paso}
          today={entrada.dateISO}
          currency={currency}
          locale={locale}
          enCentro={alCentro !== undefined}
          esperandoBrief={pidiendoBrief}
          identidadDeclarada={identidadDeclarada}
          marcados={marcados}
          onMarcado={(habitId, entry) => setMarcados((m) => ({ ...m, [habitId]: entry }))}
          onCerrar={() => cerrar("terminado")}
        />
      </div>

      <div className="rit-bottom">
        <button className="rit-next" onClick={avanzar} aria-label={esUltimo ? "Terminar" : "Siguiente"}>
          {esUltimo ? "✓" : "→"}
        </button>
      </div>
    </div>
  );
}
