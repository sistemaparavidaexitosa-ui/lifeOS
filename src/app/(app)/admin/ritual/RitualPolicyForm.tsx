"use client";

import { useState, useTransition } from "react";
import { updateRitualPolicy } from "./actions";
import { ETIQUETA_PASO, PASOS_RITUAL, type RitualPolicy } from "@/lib/domain/ritual/types.ts";

/**
 * Los `select` de la aplicación ocupan el ancho entero por la regla global de
 * formularios; aquí van dentro de una frase («Ventana de 04:00 a 12:00») y
 * estirados la partían en tres renglones.
 */
const AUTO = { width: "auto" } as const;

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const FRECUENCIAS = ["Diario", "Entre semana", "Fin de semana", "Semanal"] as const;

function horaLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * La política GLOBAL del arranque guiado: lo que se decide aquí lo recibe todo
 * el mundo, y cada persona solo puede apagar partes desde su Configuración.
 *
 * Los pasos se listan en el ORDEN NARRATIVO y no se pueden reordenar: el
 * administrador elige QUÉ pasos, no en qué orden (D-165).
 */
export default function RitualPolicyForm({ policy }: { policy: RitualPolicy }) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const encendidos = new Set(policy.steps);

  return (
    <form
      className="flex flex-col gap-3"
      action={(formData) =>
        startTransition(async () => {
          const r = await updateRitualPolicy(formData);
          setMensaje(r.ok ? "Guardado. Se aplica en la próxima carga de cada persona." : (r.reason ?? "No se pudo guardar."));
        })
      }
    >
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="enabled" defaultChecked={policy.enabled} />
        Arranque guiado activo
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs mb-1" style={{ color: "var(--muted)" }}>
          Pasos permitidos. Cada uno aparece solo si la persona tiene datos para él: sin brief no hay afirmación, sin
          hábitos pendientes no hay paso de rutina.
        </legend>
        {PASOS_RITUAL.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={`step.${p}`} defaultChecked={encendidos.has(p)} />
            {ETIQUETA_PASO[p]}
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span>Ventana de</span>
        <select name="windowStart" defaultValue={policy.windowStart} aria-label="Hora de inicio" style={AUTO}>
          {HORAS.map((h) => (
            <option key={h} value={h}>
              {horaLabel(h)}
            </option>
          ))}
        </select>
        <span>a</span>
        <select name="windowEnd" defaultValue={policy.windowEnd} aria-label="Hora de fin" style={AUTO}>
          {HORAS.map((h) => (
            <option key={h} value={h}>
              {horaLabel(h)}
            </option>
          ))}
        </select>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          (hora local de cada persona; la de fin ya queda fuera)
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm flex-wrap">
        Qué días
        <select name="frequency" defaultValue={policy.frequency} style={AUTO}>
          {FRECUENCIAS.map((f) => (
            <option key={f} value={f}>
              {f === "Semanal" ? "Semanal (lunes)" : f}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm flex-wrap">
        Máximo de hábitos por arranque
        <input
          type="number"
          name="maxRoutineSteps"
          min={1}
          max={20}
          defaultValue={policy.maxRoutineSteps}
          style={{ width: 70 }}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="aiEnabled" defaultChecked={policy.aiEnabled} />
        Mostrar lo que escribe la IA (afirmaciones, mantra, visualización, acción)
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="blocking" defaultChecked={policy.blocking} />
        Bloquear la aplicación de fondo mientras está abierto
      </label>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Bloqueada o no, el arranque <b>siempre</b> se puede omitir con Escape o con «Ahora no». Es la única
        opción que no existe aquí, y es a propósito: un ritual que no se puede saltar se convierte en un peaje.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn-primary btn-sm" type="submit" disabled={pending}>
          Guardar
        </button>
        {mensaje && (
          <span className="text-xs" role="status">
            {mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
