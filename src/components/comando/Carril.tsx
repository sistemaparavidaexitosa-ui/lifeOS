"use client";
// src/components/comando/Carril.tsx
// Un frente del Centro (D-177).
//
// TRES DE ESTOS SON LA NAVEGACIÓN. No un menú de veintitrés destinos —ése se
// borró en D-169 y no vuelve— sino tres puertas que cambian de contenido según
// lo que hoy mueva la aguja en cada objetivo: terminar lo empezado, acercarte a
// quien quieres ser, y cumplir tus metas de dinero.
//
// UN CARRIL EN CALMA SIGUE SIENDO NAVEGACIÓN. Cuando no hay nada urgente no se
// esconde ni se pinta un hueco: dice qué sabe del frente, con su cifra, y te
// deja entrar igual. Esconder el que va bien deja a la persona sin saber si es
// que no hay nada o es que no se miró.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CARRIL_NOMBRE,
  CARRIL_OBJETIVO,
  ETIQUETA,
  type CarrilDelCentro
} from "@/lib/domain/comando/tipos.ts";
import { ICONO, TONO } from "./categoria";
import { NAV_ICONS } from "@/components/icons";
import { Chip } from "@/components/ui";
import HabitCheckbox from "@/components/habits/HabitCheckbox";

export default function Carril({
  via,
  today,
  dominante,
  pendiente,
  onResuelto,
  onAhoraNo,
  onAceptar,
  onNavegar
}: {
  via: CarrilDelCentro;
  today: string;
  /** El frente que manda ahora. El suyo se pinta con más peso. */
  dominante: boolean;
  pendiente: boolean;
  onResuelto: (id: string) => void;
  onAhoraNo: (id: string) => void;
  onAceptar: (propuestaId: string, href: string | null, id: string) => void;
  onNavegar: () => void;
}) {
  const router = useRouter();
  const [navegando, startTransition] = useTransition();
  const item = via.item;

  function ir(href: string) {
    onNavegar();
    startTransition(() => router.push(href));
  }

  return (
    <article className={dominante ? "cmd-carril cmd-carril-manda" : "cmd-carril"}>
      <header className="cmd-carril-cab">
        <span className="cmd-carril-nombre">{CARRIL_NOMBRE[via.carril]}</span>
        <span className="cmd-carril-objetivo">{CARRIL_OBJETIVO[via.carril]}</span>
      </header>

      {item ? (
        <>
          <div className="cmd-item-meta">
            {(() => {
              const Icono = NAV_ICONS[ICONO[item.categoria]];
              return <Icono width={14} height={14} aria-hidden />;
            })()}
            <Chip kind={TONO[item.categoria]}>{ETIQUETA[item.categoria]}</Chip>
            {item.voz && <span className="cmd-voz">{item.voz}</span>}
          </div>

          <h3 className={dominante ? "cmd-titulo cmd-titulo-heroe" : "cmd-titulo"}>{item.titulo}</h3>

          <div className="cmd-acciones">
            {item.datos.tipo === "habito" && (
              <HabitCheckbox
                routineId={item.datos.routineId}
                habitId={item.datos.habitId}
                today={today}
                entry={null}
                size={dominante ? 48 : 34}
                onResult={(nuevo, err) => {
                  if (!err && nuevo) onResuelto(item.id);
                }}
              />
            )}

            {item.datos.tipo === "propuesta" && item.accion && (
              <button
                className="btn-primary btn-sm"
                disabled={pendiente}
                onClick={() =>
                  onAceptar(item.datos.tipo === "propuesta" ? item.datos.propuestaId : "", item.href, item.id)
                }
              >
                {item.accion}
              </button>
            )}

            {item.datos.tipo === "navegar" && item.accion && item.href && (
              <button className="btn-primary btn-sm" disabled={navegando} onClick={() => ir(item.href!)}>
                {item.accion}
              </button>
            )}

            {/* «Ahora no» aparta, no borra: la regla de D-169 sobrevive. */}
            <button className="btn-ghost btn-sm" disabled={pendiente} onClick={() => onAhoraNo(item.id)}>
              Ahora no
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="cmd-carril-calma">{via.estado}</p>
          <div className="cmd-acciones">
            <button className="btn-ghost btn-sm" disabled={navegando} onClick={() => ir(via.href)}>
              {via.destino}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
