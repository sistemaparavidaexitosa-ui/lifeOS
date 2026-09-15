"use client";

import { useState, useTransition } from "react";
import FormSheet, { Field, FormActions } from "../FormSheet";
import ScalePicker from "./ScalePicker";
import { logHabit } from "./actions";
import type { HabitLogEntry, LogStatus } from "@/lib/domain/development/habit-analytics.ts";

/** Lo que ve la persona; `partial` se guarda como `completed` con menos de 100 %. */
type Opcion = "done" | "partial" | "postponed" | "skipped";

const OPCIONES: { value: Opcion; label: string; hint: string }[] = [
  { value: "done", label: "Hecho", hint: "Completo" },
  { value: "partial", label: "Parcial", hint: "Un voto a medias sigue siendo voto" },
  { value: "postponed", label: "Sin oportunidad", hint: "No cuenta ni corta la racha" },
  { value: "skipped", label: "Omitido", hint: "Cuenta en contra y corta la racha" }
];

function opcionDe(entry: HabitLogEntry | undefined): Opcion {
  if (!entry) return "done";
  if (entry.status === "completed") return entry.pct < 100 ? "partial" : "done";
  return entry.status;
}

/**
 * Registro con detalle de un hábito: qué pasó, cuánto, una nota y cómo estabas.
 *
 * Vive detrás de «…» y no en la fila porque marcar tiene que seguir siendo UN
 * toque: la mayoría de los días basta con eso, y un formulario en cada casilla
 * es la forma más rápida de que la persona deje de registrar.
 *
 * La fecha admite hasta una semana atrás (lo valida también la acción). Al
 * cambiarla, el formulario se rellena con lo que ya hubiera ese día, para
 * corregir en vez de pisar a ciegas.
 */
export default function HabitLogSheet({
  habitId,
  habitName,
  today,
  minDate,
  recent
}: {
  habitId: string;
  habitName: string;
  /** Hoy en la zona del perfil, calculado en el servidor (D-018). */
  today: string;
  minDate: string;
  /** Registros de los últimos días, para rellenar al cambiar la fecha. */
  recent: HabitLogEntry[];
}) {
  return (
    <FormSheet
      label={
        <>
          <span aria-hidden="true">…</span>
          <span className="sr-only">Registrar {habitName} con detalle</span>
        </>
      }
      title={`Registrar · ${habitName}`}
    >
      {(close) => <Campos habitId={habitId} today={today} minDate={minDate} recent={recent} close={close} />}
    </FormSheet>
  );
}

function Campos({
  habitId,
  today,
  minDate,
  recent,
  close
}: {
  habitId: string;
  today: string;
  minDate: string;
  recent: HabitLogEntry[];
  close: () => void;
}) {
  const porFecha = new Map(recent.map((r) => [r.date, r]));
  const inicial = porFecha.get(today);

  const [date, setDate] = useState(today);
  const [opcion, setOpcion] = useState<Opcion>(opcionDe(inicial));
  const [pct, setPct] = useState(inicial && inicial.pct > 0 && inicial.pct < 100 ? inicial.pct : 50);
  const [note, setNote] = useState(inicial?.note ?? "");
  const [mood, setMood] = useState<number | null>(inicial?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(inicial?.energy ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cambiarFecha(nueva: string) {
    setDate(nueva);
    const e = porFecha.get(nueva);
    setOpcion(opcionDe(e));
    setPct(e && e.pct > 0 && e.pct < 100 ? e.pct : 50);
    setMood(e?.mood ?? null);
    setEnergy(e?.energy ?? null);
    setNote(e?.note ?? "");
  }

  function guardar() {
    const status: LogStatus = opcion === "done" || opcion === "partial" ? "completed" : opcion;
    startTransition(async () => {
      const r = await logHabit({
        habitId,
        date,
        status,
        completionPct: opcion === "done" ? 100 : opcion === "partial" ? pct : 0,
        note,
        mood,
        energy
      });
      if (!r.ok) {
        setError(r.reason ?? "No se pudo guardar.");
        return;
      }
      setError(null);
      close();
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <Field label="Día">
        <input type="date" value={date} min={minDate} max={today} onChange={(e) => cambiarFecha(e.target.value)} required />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
          ¿Qué pasó?
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {OPCIONES.map((o) => {
            const activo = opcion === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={activo}
                onClick={() => setOpcion(o.value)}
                className="rounded-xl p-2.5 text-left flex flex-col gap-0.5"
                style={{
                  border: `1px solid ${activo ? "var(--accent)" : "var(--line)"}`,
                  background: activo ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "var(--surface)"
                }}
              >
                <b className="text-sm">{o.label}</b>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {o.hint}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {opcion === "partial" && (
        <Field label={`Cuánto hiciste: ${pct} %`}>
          <input
            type="range"
            min={5}
            max={95}
            step={5}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            aria-valuetext={`${pct} por ciento`}
          />
        </Field>
      )}

      <Field label="Nota (opcional)">
        <textarea
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Qué ayudó, qué estorbó"
          autoCapitalize="sentences"
        />
      </Field>

      <ScalePicker label="Ánimo" value={mood} onChange={setMood} hints={["Bajo", "Muy bien"]} />
      <ScalePicker label="Energía" value={energy} onChange={setEnergy} hints={["Agotado", "A tope"]} />

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </div>
      )}

      <FormActions pending={pending} onCancel={close} saveLabel="Guardar registro" />
    </form>
  );
}
