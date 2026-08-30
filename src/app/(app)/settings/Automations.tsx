"use client";
// Reglas de automatización.
//
// Viven en Configuración y no en una pantalla propia porque son PERSONALES:
// cuelgan de `user_id`, nadie más las ve, y son del mismo tipo de ajuste que el
// opt-in del motor que está justo al lado.
//
// El formulario muestra solo los campos que la acción elegida necesita. Un
// formulario con los ocho campos siempre visibles obliga a adivinar cuáles
// aplican, y la mitad se guardarían vacíos.

import { useState, useTransition } from "react";
import { upsertAutomation, toggleAutomation, deleteAutomation } from "@/lib/automations/actions";
import {
  ACTION_LABEL,
  TRIGGER_LABEL,
  isImpactAction,
  type ActionType,
  type TriggerType
} from "@/lib/domain/automations/rules.ts";
import { PRESET_LABEL, type ReminderPreset } from "@/lib/domain/execution/reminders.ts";
import { STATUS_META } from "@/app/(app)/execution/status-meta";
import type { TaskStatus } from "@/lib/domain/types.ts";

export interface AutomationRow {
  id: string;
  name: string;
  enabled: boolean;
  authorized: boolean;
  triggerType: TriggerType;
  actionType: ActionType;
}

const TRIGGERS: TriggerType[] = ["task.status_changed", "task.assigned", "comment.added"];
const ACTIONS: ActionType[] = ["log_entry", "create_reminder", "create_task", "set_status"];
const STATUSES = Object.keys(STATUS_META) as TaskStatus[];
const PRESETS: ReminderPreset[] = ["manana", "en-3-dias", "proxima-semana"];

export default function Automations({ rules }: { rules: AutomationRow[] }) {
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [trigger, setTrigger] = useState<TriggerType>("task.status_changed");
  const [action, setAction] = useState<ActionType>("log_entry");
  const [error, setError] = useState<string | null>(null);

  const impacto = isImpactAction(action);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Se disparan con lo que HACES en la app —cambiar un estado, asignar, comentar—, no con el reloj: no hay ningún
        proceso que despierte por horario, y ofrecer «cada lunes» sería prometer algo que no ocurre.
      </p>

      {rules.length > 0 && (
        <div>
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 flex-wrap py-2"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <div className="grow min-w-0">
                <b className="block text-sm truncate">{r.name}</b>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {TRIGGER_LABEL[r.triggerType]} → {ACTION_LABEL[r.actionType]}
                  {isImpactAction(r.actionType) && !r.authorized && " · propone, no ejecuta"}
                </span>
              </div>
              <button
                className="btn-ghost btn-sm"
                disabled={pending}
                onClick={() => startTransition(() => toggleAutomation(r.id, !r.enabled))}
              >
                {r.enabled ? "Desactivar" : "Activar"}
              </button>
              <button
                className="btn-ghost btn-sm"
                disabled={pending}
                onClick={() => startTransition(() => deleteAutomation(r.id))}
              >
                Borrar
              </button>
            </div>
          ))}
        </div>
      )}

      {!abierto ? (
        <div>
          <button className="btn-ghost btn-sm" onClick={() => setAbierto(true)}>
            Nueva regla
          </button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          action={(fd) =>
            startTransition(async () => {
              const result = await upsertAutomation(fd);
              if (result.ok) {
                setAbierto(false);
                setError(null);
              } else setError(result.reason ?? "No se pudo guardar.");
            })
          }
        >
          <input name="name" placeholder="Nombre de la regla" required maxLength={80} />

          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Cuándo
            <select name="triggerType" value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerType)}>
              {TRIGGERS.map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABEL[t]}
                </option>
              ))}
            </select>
          </label>

          {trigger === "task.status_changed" && (
            <label className="text-xs" style={{ color: "var(--muted)" }}>
              A qué estado (vacío = cualquiera)
              <select name="triggerTo" defaultValue="">
                <option value="">Cualquiera</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {trigger !== "task.status_changed" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="triggerOnlyMine" />
              {trigger === "comment.added" ? "Solo si me mencionan" : "Solo si me asignan a mí"}
            </label>
          )}

          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Entonces
            <select name="actionType" value={action} onChange={(e) => setAction(e.target.value as ActionType)}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </select>
          </label>

          {action === "set_status" && (
            <label className="text-xs" style={{ color: "var(--muted)" }}>
              Mover a
              <select name="actionTo" defaultValue="Blocked">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {action === "create_reminder" && (
            <label className="text-xs" style={{ color: "var(--muted)" }}>
              Para cuándo
              <select name="actionPreset" defaultValue="manana">
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {PRESET_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {action !== "set_status" && (
            <input
              name="actionText"
              placeholder={action === "create_task" ? "Título de la tarea" : "Texto"}
              maxLength={300}
              required={action !== "create_reminder"}
            />
          )}

          {impacto && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="authorized" />
              Autorizar a ejecutarla sola
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                (sin esto la propone y la anota, pero no la ejecuta)
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <button className="btn-primary btn-sm" type="submit" disabled={pending}>
              Guardar
            </button>
            <button className="btn-ghost btn-sm" type="button" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
