"use client";

import { useState, useTransition } from "react";
import { updateNotificationPrefs } from "./actions";

/**
 * QUÉ AVISOS QUIERES Y A QUÉ HORA — de la cuenta, no del dispositivo.
 *
 * Va separado de `PushNotifications` a propósito, aunque estén en la misma
 * tarjeta: aquello es «este navegador» y esto es «tú». Mezclarlos haría pensar
 * que apagar las menciones aquí solo las apaga en el portátil.
 *
 * SIN FILA = TODO ENCENDIDO (0049). Por eso los valores llegan ya resueltos
 * desde el servidor y este componente no distingue «no hay fila» de «hay fila
 * con todo en true»: para quien mira la pantalla son lo mismo, y al guardar la
 * fila se crea.
 */
export interface PrefsValues {
  mentions: boolean;
  assignments: boolean;
  reminders: boolean;
  dueDigest: boolean;
  digestHour: number;
  coachEnabled: boolean;
  coachMorningHour: number;
  coachNightHour: number;
}

const HORAS = Array.from({ length: 24 }, (_, h) => h);

function horaLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export default function NotificationPrefs({ values }: { values: PrefsValues }) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2"
      // La acción se envuelve para poder DECIR si guardó. Un formulario que se
      // manda y no contesta nada es indistinguible de uno que no guardó, que
      // es justo la queja que trajo esta pantalla aquí.
      action={(formData) =>
        startTransition(async () => {
          const r = await updateNotificationPrefs(formData);
          setMensaje(r.ok ? "Guardado." : (r.reason ?? "No se pudo guardar."));
        })
      }
    >
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Esto vale para <b>tu cuenta</b>, no para un dispositivo: apagar algo aquí lo apaga en el teléfono, en la
        campana y en el correo. Las horas son <b>tu hora local</b>, la de tu zona horaria de arriba.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="mentions" defaultChecked={values.mentions} />
        Cuando alguien me menciona
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="assignments" defaultChecked={values.assignments} />
        Cuando me asignan una tarea
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="reminders" defaultChecked={values.reminders} />
        Mis recordatorios
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dueDigest" defaultChecked={values.dueDigest} />
          Resumen diario de vencimientos
        </label>
        <select name="digestHour" defaultValue={values.digestHour} className="text-sm">
          {HORAS.map((h) => (
            <option key={h} value={h}>
              {horaLabel(h)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 4 }}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="coachEnabled" defaultChecked={values.coachEnabled} />
          <b>Coach de vida</b>: dos mensajes al día
        </label>
        <p className="text-xs" style={{ color: "var(--muted)", margin: "6px 0" }}>
          Por la mañana te dice qué tienes por delante y a qué prestar atención; por la noche, qué se cerró y qué
          conviene mover a mañana. Llega a la campana, suena en el teléfono si lo tienes activado, y queda como un
          mensaje suyo en el chat lateral, donde le puedes contestar.
        </p>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span>Mañana</span>
          <select name="coachMorningHour" defaultValue={values.coachMorningHour}>
            {HORAS.map((h) => (
              <option key={h} value={h}>
                {horaLabel(h)}
              </option>
            ))}
          </select>
          <span>Noche</span>
          <select name="coachNightHour" defaultValue={values.coachNightHour}>
            {HORAS.map((h) => (
              <option key={h} value={h}>
                {horaLabel(h)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <button type="submit" className="btn-primary btn-sm" disabled={pending} style={{ alignSelf: "flex-start" }}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {mensaje && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
