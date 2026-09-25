"use client";

import { useState } from "react";
import { toggleHabitToday } from "@/app/(app)/development/routines/actions";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

type EstadoFila = { motivo: string } | null;

/**
 * La rutina de ahora (T3): el hidratador solo manda hábitos PENDIENTES, así
 * que marcarlos aquí es lo único que hace esta sección — nada de desmarcar,
 * eso vive en «Rutinas». Reusa `toggleHabitToday` (la misma acción que la
 * página de rutinas) para que el registro y el cierre de la rutina sean
 * idénticos se toque desde donde se toque.
 *
 * El toque se pinta al instante: el hábito pasa a hecho en cuanto se toca y
 * solo vuelve atrás si la acción falla. Esperar a la acción —sesión, escritura,
 * cierre de la rutina y el re-render que dispara `revalidatePath`— dejaba la
 * fila quieta un segundo o más bajo el dedo. Cada fila va por su cuenta: marcar
 * una no bloquea las demás (fix de revisión, ronda 1), y una fila hecha ya no
 * se puede volver a tocar, así que no hace falta un «en curso» aparte.
 */
export default function SeccionRutina({ data, title }: PropsDeSeccion<"rutina">) {
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});

  async function marcar(habitId: string) {
    setEstados((e) => ({ ...e, [habitId]: null }));
    setHechos((h) => new Set(h).add(habitId));
    const deshacer = (motivo: string) => {
      setHechos((h) => {
        const resto = new Set(h);
        resto.delete(habitId);
        return resto;
      });
      setEstados((e) => ({ ...e, [habitId]: { motivo } }));
    };
    try {
      const r = await toggleHabitToday(data.routineId, habitId);
      if (!r.ok) deshacer(r.reason || "No se pudo marcar.");
    } catch {
      deshacer("No se pudo marcar. Inténtalo de nuevo.");
    }
  }

  const completa = data.habitos.length > 0 && hechos.size === data.habitos.length;

  return (
    <div className="ag-card">
      <h3 className="ag-card-titulo">{title ?? "Tu rutina de ahora"}</h3>
      <p className="ag-muted ag-rutina-nombre">{data.nombre}</p>
      {completa ? (
        <p className="ag-tono-ok ag-rutina-completa">Rutina completa ✓</p>
      ) : (
        <ul className="ag-filas">
          {data.habitos.map((h) => {
            const hecho = hechos.has(h.habitId);
            const estado = estados[h.habitId];
            return (
              <li key={h.habitId} className="ag-fila">
                <button
                  type="button"
                  className="ag-fila-boton"
                  aria-pressed={hecho}
                  disabled={hecho}
                  onClick={() => void marcar(h.habitId)}
                >
                  <span className="ag-rutina-circulo" aria-hidden data-hecho={hecho} />
                  <span className="ag-fila-texto">
                    <span className={hecho ? "ag-rutina-nombre-hecho" : undefined}>{h.nombre}</span>
                  </span>
                  {h.duracionMin !== null && <span className="ag-muted">{h.duracionMin} min</span>}
                </button>
                {estado && <span className="ag-tono-bad ag-rutina-error">{estado.motivo}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

registrarSeccion("rutina", SeccionRutina);
