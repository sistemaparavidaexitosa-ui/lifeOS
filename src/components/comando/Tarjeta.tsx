"use client";
// src/components/comando/Tarjeta.tsx
// Una cosa que el centro te pide (D-176).
//
// DOS TAMAÑOS, UNA TARJETA. `heroe` es lo que el usuario debe hacer AHORA:
// tipografía grande y un solo botón. El resto van en fila compacta. Que sean el
// mismo componente no es ahorro de código, es la garantía de que lo que se ve
// arriba y lo que se ve abajo tienen exactamente las mismas acciones — si el
// foco cambia por un «Ahora no», la tarjeta que sube ya sabe comportarse.

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ItemDeMando } from "@/lib/domain/comando/tipos.ts";
import { ETIQUETA } from "@/lib/domain/comando/tipos.ts";
import { ICONO, TONO } from "./categoria";
import { NAV_ICONS } from "@/components/icons";
import { Chip } from "@/components/ui";
import HabitCheckbox from "@/components/habits/HabitCheckbox";

export default function Tarjeta({
  item,
  today,
  heroe = false,
  onResuelto,
  onAhoraNo,
  onAceptar,
  pendiente
}: {
  item: ItemDeMando;
  today: string;
  heroe?: boolean;
  onResuelto: (id: string) => void;
  onAhoraNo: (id: string) => void;
  onAceptar: (propuestaId: string, href: string | null, id: string) => void;
  pendiente: boolean;
}) {
  const router = useRouter();
  const [navegando, startTransition] = useTransition();
  const Icono = NAV_ICONS[ICONO[item.categoria]];

  function ir(href: string) {
    startTransition(() => router.push(href));
  }

  return (
    <article className={heroe ? "cmd-item cmd-item-heroe" : "cmd-item"}>
      <div className="cmd-item-meta">
        <Icono width={14} height={14} aria-hidden />
        <Chip kind={TONO[item.categoria]}>{ETIQUETA[item.categoria]}</Chip>
        {item.voz && <span className="cmd-voz">{item.voz}</span>}
      </div>

      <h3 className={heroe ? "cmd-titulo cmd-titulo-heroe" : "cmd-titulo"}>{item.titulo}</h3>

      <div className="cmd-acciones">
        {item.datos.tipo === "habito" && (
          <HabitCheckbox
            routineId={item.datos.routineId}
            habitId={item.datos.habitId}
            today={today}
            entry={null}
            size={heroe ? 48 : 34}
            onResult={(nuevo, err) => {
              if (!err && nuevo) onResuelto(item.id);
            }}
          />
        )}

        {item.datos.tipo === "propuesta" && item.accion && (
          <button
            className="btn-primary btn-sm"
            disabled={pendiente}
            onClick={() => onAceptar(item.datos.tipo === "propuesta" ? item.datos.propuestaId : "", item.href, item.id)}
          >
            {item.accion}
          </button>
        )}

        {item.datos.tipo === "navegar" && item.accion && item.href && (
          <button className="btn-primary btn-sm" disabled={navegando} onClick={() => ir(item.href!)}>
            {item.accion}
          </button>
        )}

        {/* «Ahora no» aparta, no borra: la regla de D-169 sobrevive a D-176.
            El aviso de apertura no se aparta porque no pide nada. */}
        {item.datos.tipo !== "aviso" && (
          <button className="btn-ghost btn-sm" disabled={pendiente} onClick={() => onAhoraNo(item.id)}>
            Ahora no
          </button>
        )}
      </div>
    </article>
  );
}
