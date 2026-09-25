"use client";

import { useOptimistic, useTransition } from "react";
import { toggleHabitToday } from "@/app/(app)/development/routines/actions";
import { toggledEntry, type HabitLogEntry } from "@/lib/domain/development/habit-analytics.ts";

/**
 * Cómo se pinta la casilla según el registro de hoy (0063). Omitido y pospuesto
 * no se ven como vacíos: la persona ya dijo algo sobre el día, y una casilla en
 * blanco le pediría decirlo otra vez.
 *
 * ESTO VIVÍA DENTRO DE `HabitRow.tsx`, junto a la fila que lo usaba. El arranque
 * guiado (D-165) pinta el mismo hábito con otra forma —una tarjeta enorme en
 * lugar de una fila— y con el mismo significado. Copiar los cinco estados a un
 * segundo archivo habría durado hasta el primer estado nuevo: así «una sola
 * forma de marcar un hábito en toda la aplicación» deja de ser un comentario y
 * pasa a ser un archivo.
 */
export function casilla(entry: HabitLogEntry | null): {
  borde: string;
  fondo: string;
  color: string;
  marca: string;
  etiqueta: string;
} {
  if (!entry) return { borde: "var(--line)", fondo: "transparent", color: "inherit", marca: "", etiqueta: "Marcar como cumplido" };
  if (entry.status === "skipped") {
    return { borde: "var(--danger)", fondo: "transparent", color: "var(--danger)", marca: "–", etiqueta: "Omitido hoy. Tocar para marcar como cumplido" };
  }
  if (entry.status === "postponed") {
    return { borde: "var(--warn)", fondo: "transparent", color: "var(--warn)", marca: "→", etiqueta: "Sin oportunidad hoy. Tocar para marcar como cumplido" };
  }
  if (entry.pct < 100) {
    // Parcial: el anillo se llena hasta el porcentaje, el mismo `conic-gradient`
    // que usan los anillos de metas y ahorro.
    return {
      borde: "transparent",
      fondo: `conic-gradient(var(--ok) ${entry.pct}%, var(--surface2) 0)`,
      color: "var(--text)",
      marca: `${entry.pct}`,
      etiqueta: `Hecho al ${entry.pct} %. Tocar para desmarcar`
    };
  }
  return { borde: "var(--ok)", fondo: "var(--ok)", color: "#fff", marca: "✓", etiqueta: "Marcar como no cumplido" };
}

/**
 * El botón que marca un hábito. Llama a `toggleHabitToday`, que ya existía y ya
 * revalida las pantallas afectadas — aquí no se envuelve ni se reimplementa.
 *
 * El resultado sube por `onResult` en vez de pintarse aquí: la fila de rutinas
 * enseña el error debajo del nombre y el ritual lo enseña a pantalla completa,
 * y esa decisión es de quien lo usa.
 *
 * EL TOQUE SE PINTA AL INSTANTE (`useOptimistic`). Antes la casilla esperaba a
 * la acción entera —sesión, escritura, cierre de la rutina y el re-render de la
 * página que dispara `revalidatePath`— y en el teléfono eso era un segundo o
 * más sin que nada cambiara bajo el dedo. Ahora pinta `toggledEntry`, que es
 * lo mismo que la acción va a devolver, y cuando la acción termina manda lo que
 * `onResult` le dé al padre: si falló, el padre devuelve el registro de antes y
 * la casilla vuelve sola.
 *
 * Tampoco se deshabilita mientras espera: tocar dos veces es marcar y
 * desmarcar, y Next ejecuta las acciones de una en una, así que la segunda
 * llega al servidor después de la primera y ve su resultado.
 */
export default function HabitCheckbox({
  routineId,
  habitId,
  today,
  entry,
  size = 34,
  onResult
}: {
  routineId: string;
  habitId: string;
  today: string;
  entry: HabitLogEntry | null;
  /** Lado del botón en píxeles. La fila usa 34; el ritual, mucho más. */
  size?: number;
  onResult: (entry: HabitLogEntry | null, error: string | null) => void;
}) {
  const [, startTransition] = useTransition();
  const [visible, pintar] = useOptimistic(entry);
  const c = casilla(visible);

  return (
    <button
      className="rounded-full grid place-items-center flex-shrink-0 font-bold"
      style={{
        width: size,
        height: size,
        // La marca crece con el botón: a 34px son 11px, y a 96px se vería
        // perdida en el centro de un círculo enorme.
        fontSize: Math.max(11, Math.round(size / 3)),
        border: `2px solid ${c.borde}`,
        background: c.fondo,
        color: c.color,
        transition: "background .18s ease, border-color .18s ease"
      }}
      onClick={() =>
        startTransition(async () => {
          pintar(toggledEntry(visible, today));
          const r = await toggleHabitToday(routineId, habitId);
          if (!r.ok) {
            onResult(entry, r.reason ?? "No se pudo guardar.");
            return;
          }
          if (r.entry === undefined) {
            onResult(entry, null);
            return;
          }
          onResult(
            r.entry
              ? { date: today, status: r.entry.status, pct: r.entry.pct, note: entry?.note, mood: entry?.mood, energy: entry?.energy }
              : null,
            null
          );
        })
      }
      aria-label={c.etiqueta}
    >
      {c.marca}
    </button>
  );
}
