"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContenidoDelRitual } from "@/lib/data/ritual";
import { vistaInicial, type ModoNavegacion } from "@/lib/domain/centro/apertura.ts";
import { contenidoParaRepetir, setNavMode } from "@/lib/ritual/actions";
import RitualOverlay from "./RitualOverlay";
import CentroPremium from "./CentroPremium";
import CentroAgente from "@/components/centro-agente/CentroAgente";
import BotonCentro from "./BotonCentro";
import { EVENTO_ABRIR_CENTRO } from "./eventos";

export interface DatosDelRitual {
  contenido: ContenidoDelRitual;
  blocking: boolean;
  currency: string;
  locale: string;
}

/**
 * El anfitrión de la capa premium (D-165 y D-166).
 *
 * LA PUERTA LO PINTA SIEMPRE, con datos o sin ellos. Nació así porque marcar un
 * hábito revalida la pantalla, el layout se vuelve a pintar y la puerta —que ve
 * la fila de `ritual_runs` recién escrita— contesta «ya visto»: sin enganchar el
 * contenido, el ritual se cerraba solo en cuanto la persona hacía lo que le
 * pedía. «Ya visto» decide MONTAR, no desmontar.
 *
 * Ahora además orquesta el centro: ritual → centro → botón.
 */
export default function RitualHost({
  datos,
  abrirCentro,
  navMode,
  cabecera,
  hourLocal,
  ritualPermitido,
  workspaceId,
  currency,
  locale,
  agente
}: {
  datos: DatosDelRitual | null;
  /**
   * Si el centro tiene que estar abierto YA, decidido en el servidor (D-168).
   * Llega como estado inicial y no como efecto: un efecto es exactamente lo que
   * producía el parpadeo.
   */
  abrirCentro: boolean;
  navMode: ModoNavegacion;
  cabecera: { saludo: string; nombre: string; dateISO: string };
  hourLocal: number;
  /** Si la política del administrador permite el ritual (D-165). */
  ritualPermitido: boolean;
  /** Espacio personal, donde se crean las tareas aceptadas desde el centro. */
  workspaceId: string | null;
  currency: string;
  locale: string;
  /** AGENTIC_CENTER_RUNTIME (D-194): con esto encendido, el Centro es el agente. */
  agente: boolean;
}) {
  const [ritual, setRitual] = useState<DatosDelRitual | null>(datos);
  const [modo, setModo] = useState<ModoNavegacion>(navMode);
  const [vista, setVista] = useState<"ritual" | "centro" | null>(() =>
    vistaInicial({ hayArranque: Boolean(datos), abrirCentro, agente })
  );
  // T3: si el Centro reemplazó al arranque de hoy —«hayArranque» era cierto—,
  // «Hoy» tiene que EMPEZAR por la rutina. Fijado al montar y no derivado de
  // `vista`: abrir el Centro más tarde desde el botón (`mostrarCentro`) no es
  // un arranque de la mañana, y no debe volver a marcar «visto hoy».
  const [matutino] = useState(() => agente && Boolean(datos));

  // Solo engancha: un `null` que llega después no suelta lo que ya se mostró.
  useEffect(() => {
    if (!ritual && datos) setRitual(datos);
  }, [datos, ritual]);

  // Nombre distinto del de la prop `abrirCentro` a propósito: aquella dice si
  // hay que abrirlo al cargar, esta lo abre. Llamarlas igual hizo que el
  // listener recibiera un booleano, y lo cazó el compilador.
  const mostrarCentro = useCallback(() => {
    setModo("premium");
    setVista("centro");
  }, []);

  useEffect(() => {
    window.addEventListener(EVENTO_ABRIR_CENTRO, mostrarCentro);
    return () => window.removeEventListener(EVENTO_ABRIR_CENTRO, mostrarCentro);
  }, [mostrarCentro]);

  // Al terminar u omitir el ritual se cae en el centro, que es la puerta. En
  // modo habitual no: allí el cierre del ritual es el de siempre.
  const finDelRitual = useCallback(() => {
    setRitual(null);
    setVista(modo === "premium" ? "centro" : null);
  }, [modo]);

  function repetirRitual() {
    void contenidoParaRepetir().then((r) => {
      if (!r.ok) return;
      setRitual({ contenido: r.contenido, blocking: r.blocking, currency, locale });
      setVista("ritual");
    });
  }

  function aHabitual() {
    setModo("habitual");
    setVista(null);
    void setNavMode("habitual");
  }

  if (vista === "ritual" && ritual) {
    return (
      <RitualOverlay
        key={ritual.contenido.dateISO + String(ritual.contenido.hayBriefDeHoy)}
        entrada={ritual.contenido}
        blocking={ritual.blocking}
        identidadDeclarada={ritual.contenido.identidadDeclarada}
        hayBriefDeHoy={ritual.contenido.hayBriefDeHoy}
        briefIntentadoHoy={ritual.contenido.briefIntentadoHoy}
        currency={ritual.currency}
        locale={ritual.locale}
        // En premium el cierre no pinta enlaces: la flecha lleva al centro.
        alCentro={modo === "premium" ? finDelRitual : undefined}
      />
    );
  }

  if (vista === "centro") {
    // Fase 2 (D-194): con el runtime encendido, el Centro es el agente —
    // superficie propia, nada del armazón viejo. Apagado, CentroPremium de siempre.
    if (agente) {
      return (
        <CentroAgente
          onCerrar={() => setVista(null)}
          onIrA={() => setVista(null)}
          workspaceId={workspaceId}
          locale={locale}
          matutino={matutino}
        />
      );
    }
    return (
      <CentroPremium
        cabecera={cabecera}
        hourLocal={hourLocal}
        locale={locale}
        onCerrar={() => setVista(null)}
        onIrA={() => setVista(null)}
        onHabitual={aHabitual}
        onRepetirRitual={ritualPermitido ? repetirRitual : null}
        workspaceId={workspaceId}
      />
    );
  }

  if (modo === "premium") return <BotonCentro onClick={() => setVista("centro")} />;
  return null;
}
