"use client";

import { useState, useTransition } from "react";
import { upsertOccupation, deleteOccupation } from "./actions";

interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
  category: string;
  recurring: boolean;
  date: string | null;
  days: number[];
}

/**
 * Se muestran empezando en lunes porque así lee la semana el usuario y así la
 * pinta WeekView, pero el VALOR es el de `Date.getUTCDay()`: domingo = 0. Por
 * eso el domingo va al final de la lista con valor 0, no con valor 7.
 */
const DAY_CHIPS: { value: number; label: string }[] = [
  { value: 1, label: "L" },
  { value: 2, label: "M" },
  { value: 3, label: "X" },
  { value: 4, label: "J" },
  { value: 5, label: "V" },
  { value: 6, label: "S" },
  { value: 0, label: "D" }
];

const TODOS = [0, 1, 2, 3, 4, 5, 6];
const ENTRE_SEMANA = [1, 2, 3, 4, 5];
const FIN_DE_SEMANA = [0, 6];

/**
 * FR-TIM-001/008: ocupaciones para cualquier día. `defaultDate` es el día para
 * el que se está creando/editando (lo pasa el llamador: "hoy" desde la vista
 * del día, o el día de la columna desde la semanal, vía DayEditor.tsx).
 *
 * Los dos modos son excluyentes y por eso se muestran uno u otro, nunca los
 * dos: o la ocupación se repite cada semana en los días marcados (`days`,
 * `occ_date` en null), o pertenece a una fecha concreta (`occ_date`, y `days`
 * se ignora). Antes el campo de fecha se quedaba visible pero deshabilitado
 * con la nota "(ignorado)", que es una forma de mostrar un control muerto.
 */
export default function OccupationForm({ occupation, defaultDate }: { occupation?: OccupationLite; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [recurring, setRecurring] = useState(occupation?.recurring ?? false);
  const [days, setDays] = useState<number[]>(occupation?.days ?? TODOS);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleDay(value: number) {
    setDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  }

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {occupation ? "Editar" : "+ Ocupación"}
      </button>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          // La base exige al menos un día (chk_occupations_days_range). Se
          // frena aquí para que el usuario vea una frase en vez de un 23514.
          if (recurring && days.length === 0) {
            setError("Elige al menos un día de la semana.");
            return;
          }
          try {
            const result = await upsertOccupation(occupation?.id ?? null, fd);
            if (!result.ok) {
              setError(result.reason ?? "No se pudo guardar la ocupación.");
              return;
            }
            setOpen(false);
            setError(null);
          } catch {
            setError("No se pudo contactar al servidor. Revisa tu conexión.");
          }
        })
      }
      className="flex flex-col gap-2"
    >
      <input name="title" placeholder="Título" defaultValue={occupation?.title} required />
      <div className="grid grid-cols-2 gap-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input name="start" type="time" defaultValue={occupation?.start} required />
        <input name="end" type="time" defaultValue={occupation?.end} required />
      </div>
      <select name="category" defaultValue={occupation?.category ?? "Trabajo"}>
        <option value="Trabajo">Trabajo</option>
        <option value="Familia">Familia</option>
        <option value="Personal">Personal</option>
        <option value="Salud">Salud</option>
        <option value="Descanso">Descanso</option>
        <option value="Otros">Otros</option>
      </select>
      <label className="row sm" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          name="recurring"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
          style={{ width: "auto" }}
        />
        Se repite cada semana
      </label>

      {recurring && (
        <div>
          <label className="text-xs" style={{ color: "var(--muted)", display: "block", marginBottom: 4 }}>
            ¿Qué días?
          </label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DAY_CHIPS.map((d) => {
              const on = days.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  aria-pressed={on}
                  title={d.label}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    fontWeight: 700,
                    border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
                    background: on ? "var(--accent)" : "var(--surface)",
                    color: on ? "#fff" : "var(--muted)"
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setDays(TODOS)}>
              Todos
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setDays(ENTRE_SEMANA)}>
              Entre semana
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setDays(FIN_DE_SEMANA)}>
              Fin de semana
            </button>
          </div>
          {/* Un campo oculto por día marcado: la Server Action los lee con
              formData.getAll("days"). La base exige al menos uno, y el submit
              de abajo lo impide antes de llegar ahí. */}
          {days.map((d) => (
            <input key={d} type="hidden" name="days" value={d} />
          ))}
        </div>
      )}

      {!recurring && (
        <div>
          <label className="text-xs" style={{ color: "var(--muted)", display: "block", marginBottom: 4 }}>
            Día
          </label>
          <input name="date" type="date" defaultValue={occupation?.date ?? defaultDate} required />
        </div>
      )}
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <div className="row" style={{ display: "flex", gap: 8 }}>
        {occupation && (
          <button
            type="button"
            className="btn-danger btn-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteOccupation(occupation.id);
                if (!result.ok) {
                  setError(result.reason ?? "No se pudo eliminar la ocupación.");
                  return;
                }
                setOpen(false);
              })
            }
          >
            Eliminar
          </button>
        )}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </button>
        <button className="btn-primary btn-sm" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
