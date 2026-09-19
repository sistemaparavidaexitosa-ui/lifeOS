"use client";

import { useState, useTransition } from "react";
import { updateRitualPrefs } from "./actions";
import { ETIQUETA_PASO, type RitualPreference, type TipoPaso } from "@/lib/domain/ritual/types.ts";

/**
 * Tu arranque del día (D-165).
 *
 * SOLO SE PINTAN LOS PASOS QUE LA POLÍTICA OFRECE. Un interruptor que no puede
 * encender nada es una promesa rota en pantalla: si el administrador apagó la
 * visualización, aquí no aparece ni desmarcada.
 */
export default function RitualPrefs({
  pref,
  ofrecidos,
  iaOfrecida
}: {
  pref: RitualPreference;
  ofrecidos: TipoPaso[];
  /** Si la política deja mostrar lo que escribe la IA. Si no, la casilla no existe. */
  iaOfrecida: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const apagados = new Set(pref.stepsOff);

  return (
    <form
      className="flex flex-col gap-2"
      action={(formData) =>
        startTransition(async () => {
          const r = await updateRitualPrefs(formData);
          setMensaje(r.ok ? "Guardado." : (r.reason ?? "No se pudo guardar."));
        })
      }
    >
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Una secuencia breve la primera vez que abres Life OS cada día: tu saludo, tu identidad, el siguiente hábito
        pendiente y lo que mueve el día. Siempre se puede omitir con Escape.
      </p>

      <input type="hidden" name="offered" value={ofrecidos.join(",")} />

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="enabled" defaultChecked={pref.enabled} />
        Mostrarme el arranque del día
      </label>

      {ofrecidos.map((p) => (
        <label key={p} className="flex items-center gap-2 text-sm" style={{ paddingLeft: 22 }}>
          <input type="checkbox" name={`step.${p}`} defaultChecked={!apagados.has(p)} />
          {ETIQUETA_PASO[p]}
        </label>
      ))}

      {iaOfrecida ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="aiEnabled" defaultChecked={pref.aiEnabled} />
          Incluir lo que escribe la IA (afirmaciones, mantra, visualización)
        </label>
      ) : (
        // Sin la casilla, el FormData no la trae y se guardaría `false`. No
        // cambia nada —la política ya la tiene apagada—, pero así la preferencia
        // de la persona sobrevive intacta al día en que el administrador la
        // vuelva a encender.
        pref.aiEnabled && <input type="hidden" name="aiEnabled" value="on" />
      )}

      <div className="flex items-center gap-2">
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
