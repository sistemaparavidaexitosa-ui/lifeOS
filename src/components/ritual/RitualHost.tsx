"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ContenidoDelRitual } from "@/lib/data/ritual";
import { debeAbrirseElCentro, type ModoNavegacion } from "@/lib/domain/centro/apertura.ts";
import { contenidoParaRepetir, setNavMode } from "@/lib/ritual/actions";
import RitualOverlay from "./RitualOverlay";
import CentroPremium from "./CentroPremium";
import BotonCentro from "./BotonCentro";
import { EVENTO_ABRIR_CENTRO } from "./eventos";

export interface DatosDelRitual {
  contenido: ContenidoDelRitual;
  blocking: boolean;
  currency: string;
  locale: string;
}

/** La marca de que esta visita ya empezó. Dura lo que dura la pestaña. */
const CLAVE_VISITA = "lifeos_visita";

/**
 * ¿Es el principio de una visita?
 *
 * Envuelto en `try`: en una ventana privada estricta, `sessionStorage` puede
 * lanzar. Tratar el fallo como «sí, es el principio» deja el centro abriéndose
 * en cada carga de Home, que es molesto pero omitible; tratarlo como «no» lo
 * dejaría inalcanzable salvo por el botón, que es peor.
 */
function inicioDeVisita(): boolean {
  try {
    if (sessionStorage.getItem(CLAVE_VISITA)) return false;
    sessionStorage.setItem(CLAVE_VISITA, "1");
    return true;
  } catch {
    return true;
  }
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
  navMode,
  cabecera,
  hourLocal,
  ritualPermitido,
  currency,
  locale
}: {
  datos: DatosDelRitual | null;
  navMode: ModoNavegacion;
  cabecera: { saludo: string; nombre: string; dateISO: string };
  hourLocal: number;
  /** Si la política del administrador permite el ritual (D-165). */
  ritualPermitido: boolean;
  currency: string;
  locale: string;
}) {
  const [ritual, setRitual] = useState<DatosDelRitual | null>(datos);
  const [modo, setModo] = useState<ModoNavegacion>(navMode);
  const [vista, setVista] = useState<"ritual" | "centro" | null>(null);
  const pathname = usePathname();

  // Solo engancha: un `null` que llega después no suelta lo que ya se mostró.
  useEffect(() => {
    if (!ritual && datos) setRitual(datos);
  }, [datos, ritual]);

  // La decisión de abrir se toma UNA vez, al montar, y con la ruta de entrada:
  // navegar después no debe reabrir nada.
  useEffect(() => {
    const primera = inicioDeVisita();
    if (datos) {
      setVista("ritual");
      return;
    }
    if (debeAbrirseElCentro({ modo: navMode, inicioDeVisita: primera, ruta: pathname })) setVista("centro");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirCentro = useCallback(() => {
    setModo("premium");
    setVista("centro");
  }, []);

  useEffect(() => {
    window.addEventListener(EVENTO_ABRIR_CENTRO, abrirCentro);
    return () => window.removeEventListener(EVENTO_ABRIR_CENTRO, abrirCentro);
  }, [abrirCentro]);

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
    return (
      <CentroPremium
        cabecera={cabecera}
        hourLocal={hourLocal}
        currency={currency}
        locale={locale}
        onCerrar={() => setVista(null)}
        onIrA={() => setVista(null)}
        onHabitual={aHabitual}
        onRepetirRitual={ritualPermitido ? repetirRitual : null}
      />
    );
  }

  if (modo === "premium") return <BotonCentro onClick={() => setVista("centro")} />;
  return null;
}
