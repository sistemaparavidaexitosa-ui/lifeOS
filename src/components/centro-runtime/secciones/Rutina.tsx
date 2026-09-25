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
 * `enCurso` es un conjunto y no un solo booleano (fix de revisión, ronda 1):
 * con un único «pendiente» compartido, marcar un hábito deshabilitaba TODAS
 * las filas hasta que esa marca terminara, y dos hábitos no se pueden marcar
 * a la vez aunque no dependan entre sí.
 */
export default function SeccionRutina({ data, title }: PropsDeSeccion<"rutina">) {
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const [enCurso, setEnCurso] = useState<Set<string>>(new Set());

  async function marcar(habitId: string) {
    setEstados((e) => ({ ...e, [habitId]: null }));
    setEnCurso((s) => new Set(s).add(habitId));
    try {
      const r = await toggleHabitToday(data.routineId, habitId);
      if (!r.ok) {
        setEstados((e) => ({ ...e, [habitId]: { motivo: r.reason || "No se pudo marcar." } }));
      } else {
        setHechos((h) => new Set(h).add(habitId));
      }
    } catch {
      setEstados((e) => ({ ...e, [habitId]: { motivo: "No se pudo marcar. Inténtalo de nuevo." } }));
    } finally {
      setEnCurso((s) => {
        const resto = new Set(s);
        resto.delete(habitId);
        return resto;
      });
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
                  disabled={enCurso.has(h.habitId) || hecho}
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
