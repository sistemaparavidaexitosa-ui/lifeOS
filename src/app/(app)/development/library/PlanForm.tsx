"use client";

// Programar un libro en la cola semanal (migración 0042).
//
// Dos campos y nada más: en qué semana empiezas y cuántas semanas le das. El
// resto —las filas, una por semana, normalizadas a lunes— lo deriva
// planWeeks() en el dominio. La alternativa (elegir cada semana a mano) hace
// que programar tres semanas cueste tres interacciones para decir lo mismo.

import { useState, useTransition } from "react";
import { scheduleBook, unscheduleBook } from "./actions";
import { MAX_PLAN_WEEKS } from "@/lib/domain/development/reading-plan.ts";
import FormSheet, { Field, FormActions } from "../FormSheet";

export default function PlanForm({
  bookId,
  title,
  currentWeek,
  planned
}: {
  bookId: string;
  title: string;
  /** Lunes de la semana en curso, calculado en el servidor con la zona del perfil. */
  currentWeek: string;
  /** Semanas ya programadas, en orden. Vacío = el libro no tiene plan. */
  planned: string[];
}) {
  return (
    <FormSheet label={planned.length ? "Replanear" : "Programar"} title={title} variant="ghost">
      {(close) => <PlanFields bookId={bookId} currentWeek={currentWeek} planned={planned} close={close} />}
    </FormSheet>
  );
}

function PlanFields({
  bookId,
  currentWeek,
  planned,
  close
}: {
  bookId: string;
  currentWeek: string;
  planned: string[];
  close: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Por defecto, esta semana: es lo que quiere el 90% de las veces quien abre
  // esto, y `planned[0]` cuando ya hay un plan que se está corrigiendo.
  const [firstWeek, setFirstWeek] = useState(planned[0] ?? currentWeek);
  const [weeks, setWeeks] = useState(String(Math.max(1, planned.length)));

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            const result = await scheduleBook(bookId, fd);
            if (!result.ok) {
              setError(result.reason ?? "No se pudo programar el libro.");
              return;
            }
            setError(null);
            close();
          } catch {
            setError("No se pudo contactar al servidor. Revisa tu conexión.");
          }
        })
      }
      className="flex flex-col gap-3"
    >
      {/* `type="date"` y no `type="week"`: la semana ISO de `type=week` cuenta
          desde el lunes igual que aquí, pero Safari no lo implementa y caería a
          un campo de texto libre. Con una fecha cualquiera basta — el servidor
          la normaliza al lunes con weekStartISO() y la columna lo exige con un
          check, así que elegir un miércoles hace lo correcto. */}
      <Field label="Empiezo la semana de">
        <input
          name="firstWeek"
          type="date"
          value={firstWeek}
          onChange={(e) => setFirstWeek(e.target.value)}
          required
        />
      </Field>

      <Field label={`Cuántas semanas (1 a ${MAX_PLAN_WEEKS})`}>
        <input
          name="weeks"
          type="number"
          min={1}
          max={MAX_PLAN_WEEKS}
          value={weeks}
          onChange={(e) => setWeeks(e.target.value)}
          required
        />
      </Field>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Se programa por semanas completas: la semana elegida y las siguientes. De ahí sale el libro que ves en Inicio
        y en el Panel, y las páginas al día que hacen falta para llegar.
      </p>

      {planned.length > 0 && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          Ahora mismo ocupa {planned.length} semana{planned.length === 1 ? "" : "s"}, desde el {planned[0]}.
        </div>
      )}

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <FormActions pending={pending} onCancel={close} saveLabel="Programar" />

      {/* NO se usa el `onDelete` de FormActions: su botón dice "Eliminar" en
          rojo, y aquí no se elimina nada — el libro y sus notas siguen ahí,
          solo sale de la cola. Un botón que parece borrar un libro y no lo
          borra es peor que uno más en la hoja. */}
      {planned.length > 0 && (
        <button
          type="button"
          className="btn-ghost btn-sm self-start"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await unscheduleBook(bookId);
              if (!result.ok) {
                setError(result.reason ?? "No se pudo quitar el plan.");
                return;
              }
              close();
            })
          }
        >
          Quitar del plan
        </button>
      )}
    </form>
  );
}
