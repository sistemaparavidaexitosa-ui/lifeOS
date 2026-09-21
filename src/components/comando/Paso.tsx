"use client";
// src/components/comando/Paso.tsx
// UNA cosa, enorme, con su frente como etiqueta (D-180).
//
// POR QUÉ UNA Y NO TRES
// D-177 enseñaba los tres frentes a la vez. Tres encabezados simultáneos
// —EXECUTION OS, PERSONAL DEVELOPMENT OS, MONEY OS— son el panel que D-169
// mató, solo con mejor tipografía; y en un teléfono empujan la barra de captura
// fuera de la pantalla, así que el Centro dejaba de pedir nada.
//
// Los tres objetivos NO se abandonan: se cubren a lo largo de la sesión. «Ahora
// no» trae el siguiente, que puede ser de otro frente, y la etiqueta de arriba
// dice siempre en cuál estás. Es la forma del Lienzo de D-169 con lo que se
// aprendió encima.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CARRIL_NOMBRE, CARRIL_OBJETIVO, type ItemDeMando } from "@/lib/domain/comando/tipos.ts";
import { ICONO_CARRIL } from "./categoria";
import { NAV_ICONS } from "@/components/icons";
import HabitCheckbox from "@/components/habits/HabitCheckbox";

export default function Paso({
  item,
  today,
  quedan,
  pendiente,
  onResuelto,
  onAhoraNo,
  onAceptar,
  onNavegar
}: {
  item: ItemDeMando;
  today: string;
  /** Cuántas quedan detrás. Un contador discreto, sin numerar pasos (D-169). */
  quedan: number;
  pendiente: boolean;
  onResuelto: (id: string) => void;
  onAhoraNo: (id: string) => void;
  onAceptar: (propuestaId: string, href: string | null, id: string) => void;
  onNavegar: () => void;
}) {
  const router = useRouter();
  const [navegando, startTransition] = useTransition();
  const Icono = NAV_ICONS[ICONO_CARRIL[item.carril]];

  function ir(href: string) {
    onNavegar();
    startTransition(() => router.push(href));
  }

  return (
    <article className="rit-step centro-paso" key={item.id}>
      <p className="rit-eyebrow centro-paso-frente">
        <Icono width={14} height={14} aria-hidden />
        <span>{CARRIL_NOMBRE[item.carril]}</span>
        <span className="centro-paso-objetivo">· {CARRIL_OBJETIVO[item.carril]}</span>
      </p>

      <h2 className="centro-paso-titulo">{item.titulo}</h2>

      {item.voz && <p className="rit-muted centro-paso-voz">{item.voz}</p>}

      <div className="centro-paso-acciones">
        {item.datos.tipo === "habito" && (
          <>
            <HabitCheckbox
              routineId={item.datos.routineId}
              habitId={item.datos.habitId}
              today={today}
              entry={null}
              size={56}
              onResult={(nuevo, err) => {
                if (!err && nuevo) onResuelto(item.id);
              }}
            />
            <span className="rit-muted">Tócalo cuando lo hayas hecho</span>
          </>
        )}

        {item.datos.tipo === "propuesta" && item.accion && (
          <button
            className="rit-sug-si"
            disabled={pendiente}
            onClick={() => onAceptar(item.datos.tipo === "propuesta" ? item.datos.propuestaId : "", item.href, item.id)}
          >
            {item.accion}
          </button>
        )}

        {item.datos.tipo === "navegar" && item.accion && item.href && (
          <button className="rit-sug-si" disabled={navegando} onClick={() => ir(item.href!)}>
            {item.accion}
          </button>
        )}

        {/* «Ahora no» aparta, no borra: la regla de D-169, intacta. */}
        <button className="rit-skip" disabled={pendiente} onClick={() => onAhoraNo(item.id)}>
          Ahora no
        </button>
      </div>

      {/* Un contador discreto, no pasos numerados: el Centro se abre veinte
          veces al día y numerar convertiría cada visita en una tarea de cinco
          pasos (D-169). */}
      {quedan > 0 && <p className="rit-muted centro-paso-quedan">Quedan {quedan}</p>}
    </article>
  );
}
