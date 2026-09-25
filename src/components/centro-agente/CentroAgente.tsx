"use client";

import { useEffect, useRef, useState } from "react";
import RuntimeScreen from "@/components/centro-runtime/RuntimeScreen";
import { ContextoDelAgente } from "@/components/centro-runtime/contexto";
import { abrirFoco, atraparFoco } from "@/lib/dom/ritual-focus.ts";
import { agregar, historialParaModelo, type Turno } from "@/lib/domain/centro/agente/hilo.ts";
import type { Screen } from "@/lib/domain/centro/runtime/types.ts";
import { startRitual } from "@/lib/ritual/actions";
import { IconClose } from "@/components/icons";
import Composer from "./Composer";

const LIMITE_MS = 45_000;

/**
 * El Centro como agente de interfaz (D-194).
 *
 * UNA CONVERSACIÓN, NO UN PANEL. Abre con «Hoy» y cada cosa que se escribe
 * añade un turno: texto + los bloques que el agente eligió, pintados por el
 * mismo renderer de la Fase 1. Nada del armazón viejo se monta aquí.
 */
export default function CentroAgente({
  onCerrar,
  onIrA,
  workspaceId,
  // No se usa todavía: nada en esta superficie formatea fecha ni moneda por su
  // cuenta —lo que llega en `screen` ya viene formateado—, pero el contrato
  // con `RitualHost` lo pasa igual que a `CentroPremium`.
  locale: _locale,
  matutino = false,
  onMatutinoRegistrado
}: {
  onCerrar: () => void;
  onIrA: () => void;
  workspaceId: string | null;
  locale: string;
  /**
   * T3: el Centro reemplazó al arranque guiado de hoy. Marca «visto hoy» UNA
   * vez, igual que hacía `RitualHost` con `startRitual` — si no, el arranque
   * viejo (o este mismo camino) volvería a dispararse en la próxima carga.
   */
  matutino?: boolean;
  /**
   * Avisa a `RitualHost` para que apague `matutino` en cuanto este montaje lo
   * usó (fix de revisión, ronda 1). Sin esto, cerrar el Centro y reabrirlo con
   * el botón o el evento de abrir el centro monta OTRO `CentroAgente` que
   * seguiría viendo `matutino=true` y volvería a llamar `startRitual`: el
   * `upsert` de `ritual_runs` es idempotente, pero el `insert` en `audit_log`
   * no — cada reapertura sumaría una fila más por algo que solo pasó una vez.
   */
  onMatutinoRegistrado?: () => void;
}) {
  const [hilo, setHilo] = useState<Turno[]>([]);
  const [cargandoHoy, setCargandoHoy] = useState(true);
  const [pensando, setPensando] = useState(false);
  // La hoja del «+» vive aquí y no en el compositor: Escape la cierra a ELLA
  // primero, en vez de cerrar el Centro y perder la conversación.
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  // Primer turno: «Hoy», de /api/centro (que ya devuelve `screen` con el flag).
  useEffect(() => {
    let vivo = true;
    void fetch("/api/centro")
      .then((r) => (r.ok ? (r.json() as Promise<{ screen?: Screen | null }>) : null))
      .catch(() => null)
      .then((r) => {
        if (!vivo) return;
        setCargandoHoy(false);
        // NUNCA una pantalla en blanco: si «Hoy» no llegó, el turno lo dice y
        // el compositor queda como el paso obvio que sigue.
        const hoy: Turno = r?.screen
          ? { id: "hoy", rol: "agente", texto: "", secciones: r.screen.sections }
          : { id: "hoy", rol: "agente", texto: "No pude preparar tu día ahora. Pregúntame lo que necesites.", secciones: [] };
        // «Hoy» va SIEMPRE primero, pero sin borrar lo que ya hubiera: la
        // persona puede haber preguntado antes de que llegara.
        setHilo((h) => [hoy, ...h]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const el = shellRef.current;
    return el ? abrirFoco(el) : undefined;
  }, []);

  // T3: UNA sola vez al montar. `startRitual` hace upsert en `ritual_runs` —lo
  // mismo que escribía el overlay viejo al abrir— así que el arranque de hoy
  // queda «visto» aunque quien lo vio haya sido el Centro. Es un efecto
  // secundario opcional: si falla, la conversación sigue igual y solo se avisa
  // en consola, como ya hacía `RitualHost` con las demás acciones del ritual.
  //
  // `onMatutinoRegistrado` se llama YA, síncrono con el montaje —no dentro del
  // `.then()`—: lo que apaga es «este Centro ya reclamó su turno de mañana»,
  // no «el registro tuvo éxito». Si esperara al resultado, cerrar el Centro
  // rápido y reabrirlo antes de que la Server Action responda montaría un
  // segundo `CentroAgente` que también viera `matutino=true`.
  useEffect(() => {
    if (!matutino) return;
    onMatutinoRegistrado?.();
    void startRitual(1).then((r) => {
      if (!r.ok) console.warn(`[centro-agente] startRitual: ${r.reason}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez al montar, por diseño.
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (hojaAbierta) setHojaAbierta(false);
        else onCerrar();
        return;
      }
      if (shellRef.current) atraparFoco(shellRef.current, e);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar, hojaAbierta]);

  // Mismo criterio que CentroPremium: la app de debajo deja de alcanzarse.
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

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [hilo, pensando]);

  async function enviar(texto: string) {
    const pregunta: Turno = { id: `p${Date.now()}`, rol: "persona", texto, secciones: [] };
    const historial = historialParaModelo(hilo);
    setHilo((h) => agregar(h, pregunta));
    setPensando(true);
    try {
      const res = await fetch("/api/centro/turno", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto, historial }),
        signal: AbortSignal.timeout(LIMITE_MS)
      });
      const r = res.ok ? ((await res.json()) as { turno?: { id: string; texto: string; secciones: Turno["secciones"] } }) : null;
      const t = r?.turno;
      setHilo((h) =>
        agregar(
          h,
          t
            ? { id: t.id, rol: "agente", texto: t.texto, secciones: t.secciones }
            : { id: `e${Date.now()}`, rol: "agente", texto: "No pude pensar esto ahora; inténtalo de nuevo.", secciones: [] }
        )
      );
    } catch (e) {
      // `AbortSignal.timeout` lanza un `TimeoutError`: solo ESE caso es
      // «tardó demasiado». Cualquier otro fallo (red, JSON) es «no pude
      // pensar», que es lo mismo que dice el `!t` de arriba.
      const texto =
        e instanceof DOMException && e.name === "TimeoutError"
          ? "Tardó demasiado. Inténtalo de nuevo."
          : "No pude pensar esto ahora; inténtalo de nuevo.";
      setHilo((h) => agregar(h, { id: `e${Date.now()}`, rol: "agente", texto, secciones: [] }));
    } finally {
      setPensando(false);
    }
  }

  return (
    <ContextoDelAgente.Provider value={{ workspaceId }}>
      <div ref={shellRef} className="ag-shell" role="dialog" aria-modal="true" aria-label="Centro">
        <header className="ag-cabecera">
          <span className="ag-logo">
            <span className="ag-logo-marca" aria-hidden>
              ✓
            </span>
            LifeOS
          </span>
          <button className="ag-cerrar" onClick={onCerrar} aria-label="Cerrar el centro">
            <IconClose width={20} height={20} />
          </button>
        </header>

        <main className="ag-hilo" aria-live="polite">
          {cargandoHoy && <div className="ag-esqueleto" aria-label="Cargando" />}
          {hilo.map((t) =>
            t.rol === "persona" ? (
              <p key={t.id} className="ag-burbuja">
                {t.texto}
              </p>
            ) : (
              <section key={t.id} className="ag-turno">
                {t.texto && (
                  <p className="ag-respuesta">
                    <span className="ag-logo-marca" aria-hidden>
                      ✓
                    </span>
                    {t.texto}
                  </p>
                )}
                {t.secciones.length > 0 && (
                  <RuntimeScreen
                    screen={{
                      id: t.id,
                      intent: t.id === "hoy" ? "hoy" : "libre",
                      title: "Centro",
                      layout: { densidad: "aireada" },
                      sections: t.secciones,
                      actions: [],
                      refreshPolicy: { tipo: "alAbrir" },
                      permissions: { lectura: true, escritura: false }
                    }}
                    onNavegar={onIrA}
                  />
                )}
              </section>
            )
          )}
          {pensando && (
            <p className="ag-respuesta ag-pensando">
              <span className="ag-logo-marca" aria-hidden>
                ✓
              </span>
              Pensando…
            </p>
          )}
          <div ref={finRef} />
        </main>

        <Composer
          onEnviar={enviar}
          ocupado={pensando}
          workspaceId={workspaceId}
          onIrA={onIrA}
          hojaAbierta={hojaAbierta}
          onHoja={setHojaAbierta}
        />
      </div>
    </ContextoDelAgente.Provider>
  );
}
