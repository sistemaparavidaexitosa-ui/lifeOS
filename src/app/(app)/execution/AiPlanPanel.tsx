"use client";
// Generar un plan de proyecto con IA: pedirlo, podarlo y confirmarlo.
//
// Vive en un componente propio porque lo usan los DOS sitios desde los que se
// arranca un proyecto —el formulario de "Nuevo proyecto" y el menú "⋯" de uno
// que ya existe—, exactamente por el mismo motivo que `ProjectTemplatePicker`:
// si el árbol y sus reglas se escribieran dos veces, una pantalla acabaría
// insertando algo distinto de la otra.
//
// Lo único que cambia entre los dos sitios es QUÉ pasa al confirmar, y eso
// entra por `onConfirm`. En un proyecto existente se escribe en la base; en uno
// que todavía no existe, el plan se guarda en el formulario y viaja con la
// creación. El panel no sabe cuál de las dos cosas ocurre.

import { useState, useTransition, type KeyboardEvent } from "react";
import {
  fullSelection,
  planSummary,
  groupKey,
  taskKey,
  subtaskKey,
  PLAN_LIMITS,
  type AiPlanDraft
} from "@/lib/domain/execution/ai-plan.ts";
import { requestAiPlan } from "./ai-plan-actions";

type DeadlineUnit = "semanas" | "meses";

export interface AiPlanConfirmResult {
  ok: boolean;
  reason?: string;
  created?: { groups: number; tasks: number };
}

export default function AiPlanPanel({
  projectId,
  taskCount = 0,
  defaultObjective = "",
  targetDate = null,
  confirmLabel,
  onConfirm,
  onDone
}: {
  /** `null` mientras el proyecto no existe: se está creando. */
  projectId: string | null;
  /** Cuántas tareas hay ya. Solo para el aviso; el plan añade al final igual. */
  taskCount?: number;
  defaultObjective?: string;
  /** Fecha objetivo del proyecto, si la tiene. Solo para prellenar el plazo. */
  targetDate?: string | null;
  confirmLabel: string;
  onConfirm: (draft: AiPlanDraft, selection: string[]) => Promise<AiPlanConfirmResult>;
  onDone: () => void;
}) {
  const inicial = deadlineFromTargetDate(targetDate);
  const [objective, setObjective] = useState(defaultObjective);
  const [amount, setAmount] = useState(inicial.amount);
  const [unit, setUnit] = useState<DeadlineUnit>(inicial.unit);
  const [refinement, setRefinement] = useState("");

  const [draft, setDraft] = useState<AiPlanDraft | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ groups: number; tasks: number } | null>(null);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function generar() {
    setError(null);
    startTransition(async () => {
      const result = await requestAiPlan({
        projectId,
        objective,
        deadline: `${amount} ${unit}`,
        refinement: refinement.trim() || undefined
      });
      if (!result.ok || !result.plan) {
        setError(result.reason ?? "No se pudo generar el plan.");
        return;
      }
      setDraft(result.plan);
      // Todo marcado de entrada: el usuario QUITA lo que le sobra. Al revés
      // —empezar en blanco y marcar— convierte una revisión de treinta
      // segundos en treinta clics.
      setSelection(fullSelection(result.plan));
    });
  }

  /**
   * Marcar y desmarcar hereda HACIA ABAJO y solo hacia abajo.
   *
   * Desmarcar un grupo apaga sus tareas y subtareas; desmarcar una subtarea no
   * toca a su padre. Es lo que se espera de un árbol de casillas, y lo
   * contrario haría imposible quedarse con una tarea descartando un paso suyo.
   * `selectionToTemplate` aplica la misma regla al insertar, así que lo que se
   * ve marcado es exactamente lo que se escribe.
   */
  function toggle(key: string, on: boolean, descendientes: string[]) {
    setSelection((prev) => {
      const next = new Set(prev);
      for (const k of [key, ...descendientes]) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  // ---------------------------------------------------------------- hecho
  //
  // El panel NO se desmonta al confirmar, y no es una preferencia de estilo:
  // es el mismo fallo que documenta `ApplyTemplatePanel`. Cerrarlo desmonta al
  // dueño del `useTransition` en el que corre la acción, la transición se
  // abandona y el árbol nuevo que el servidor ya devolvió nunca se aplica —
  // el tablero se queda igual y hay que salir del proyecto y volver a entrar.
  if (done) {
    return (
      <div className="flex flex-col gap-3" onKeyDown={stopEnterSubmit}>
        <div
          className="text-sm"
          style={{
            background: "color-mix(in srgb, var(--c-green) 12%, var(--surface))",
            borderLeft: "3px solid var(--c-green)",
            borderRadius: "0 10px 10px 0",
            padding: "10px 12px"
          }}
        >
          {projectId ? "Se añadieron" : "Se añadirán"} <b>{done.groups}</b> grupo{done.groups === 1 ? "" : "s"} y{" "}
          <b>{done.tasks}</b> tarea{done.tasks === 1 ? "" : "s"}
          {projectId ? " al final del tablero." : " al crear el proyecto."}
        </div>
        <button type="button" className="btn-primary btn-sm" onClick={onDone}>
          {projectId ? "Ver el tablero" : "Listo"}
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------- borrador
  if (draft) {
    const resumen = planSummary(draft, selection);
    const vacio = resumen.groups === 0;

    return (
      <div className="flex flex-col gap-3" onKeyDown={stopEnterSubmit}>
        <div>
          <b className="text-sm">{draft.name}</b>
          {draft.summary && (
            <p className="text-xs" style={{ color: "var(--muted)", marginTop: 2 }}>
              {draft.summary}
            </p>
          )}
        </div>

        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Desmarca lo que no quieras. Los grupos se añaden <b>al final</b>; nada de lo que ya hay se borra ni se mueve.
          Las tareas nacen <b>sin fecha</b>: el plazo va en el nombre de cada fase.
        </p>

        <div className="flex flex-col gap-3">
          {draft.groups.map((group, g) => {
            const gKey = groupKey(g);
            const hijos = group.tasks.flatMap((task, t) => [
              taskKey(g, t),
              ...task.subtasks.map((_, s) => subtaskKey(g, t, s))
            ]);
            const gOn = selection.has(gKey);

            return (
              <div key={gKey} style={{ borderLeft: `3px solid ${group.color}`, paddingLeft: 10, opacity: gOn ? 1 : 0.5 }}>
                <Row
                  checked={gOn}
                  onChange={(on) => toggle(gKey, on, hijos)}
                  label={group.name}
                  bold
                />
                <div className="flex flex-col" style={{ marginTop: 4 }}>
                  {group.tasks.map((task, t) => {
                    const tKey = taskKey(g, t);
                    const subKeys = task.subtasks.map((_, s) => subtaskKey(g, t, s));
                    const tOn = gOn && selection.has(tKey);
                    return (
                      <div key={tKey} style={{ marginLeft: 14 }}>
                        <Row
                          checked={tOn}
                          disabled={!gOn}
                          onChange={(on) => toggle(tKey, on, subKeys)}
                          label={task.title}
                          badge={task.priority === "High" ? "Alta" : undefined}
                        />
                        {task.subtasks.map((sub, s) => (
                          <div key={subKeys[s]} style={{ marginLeft: 18 }}>
                            <Row
                              checked={tOn && selection.has(subKeys[s]!)}
                              disabled={!tOn}
                              onChange={(on) => toggle(subKeys[s]!, on, [])}
                              label={sub}
                              muted
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <label className="text-xs flex flex-col gap-1" style={{ color: "var(--muted)" }}>
          ¿Qué cambiarías? (opcional, para regenerar)
          <input
            value={refinement}
            onChange={(e) => setRefinement(e.target.value)}
            placeholder="Ej: menos fases, y más peso en la parte de ventas"
            disabled={pending}
          />
        </label>

        {error && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
          <button type="button" className="btn-ghost btn-sm w-full sm:w-auto" disabled={pending} onClick={generar}>
            {pending ? "Regenerando…" : "Regenerar"}
          </button>
          <span className="hidden sm:block grow" />
          <button
            type="button"
            className="btn-primary btn-sm w-full sm:w-auto"
            disabled={pending || vacio}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await onConfirm(draft, [...selection]);
                if (!result.ok) {
                  setError(result.reason ?? "No se pudo aplicar el plan.");
                  return;
                }
                setDone(result.created ?? { groups: resumen.groups, tasks: resumen.tasks + resumen.subtasks });
              })
            }
          >
            {pending
              ? "Aplicando…"
              : vacio
                ? "No hay nada marcado"
                : `${confirmLabel} · ${resumen.groups} grupo${resumen.groups === 1 ? "" : "s"}, ${resumen.tasks} tarea${resumen.tasks === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------- formulario
  return (
    <div className="flex flex-col gap-3" onKeyDown={stopEnterSubmit}>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Describe el objetivo y el plazo. La IA propone la estructura —fases, tareas y subtareas— y la ves entera antes
        de que se cree nada.
      </p>

      <label className="text-xs flex flex-col gap-1 font-bold">
        Objetivo del proyecto
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={4}
          placeholder="Ej: lanzar una tienda de suplementos y sostener 25 ventas al día"
          disabled={pending}
          style={{ fontWeight: 400 }}
        />
      </label>

      <label className="text-xs flex flex-col gap-1 font-bold">
        Plazo total
        <span style={{ display: "flex", gap: 8, fontWeight: 400 }}>
          <input
            type="number"
            min={1}
            max={104}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
            disabled={pending}
            style={{ width: 90 }}
            aria-label="Cantidad de plazo"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as DeadlineUnit)}
            disabled={pending}
            style={{ flex: 1 }}
            aria-label="Unidad de plazo"
          >
            <option value="semanas">semanas</option>
            <option value="meses">meses</option>
          </select>
        </span>
      </label>

      {/* Decir QUÉ se envía antes de enviarlo, igual que hace el panel de
          Intelligence OS: aquí sale del servidor el texto del objetivo y, en un
          proyecto con tareas, los títulos de lo que ya hay. Nada más — ni
          responsables, ni fechas, ni comentarios. */}
      {projectId && taskCount > 0 && (
        <div
          className="text-xs"
          style={{
            background: "color-mix(in srgb, var(--c-blue) 12%, var(--surface))",
            borderLeft: "3px solid var(--c-blue)",
            borderRadius: "0 10px 10px 0",
            padding: "8px 10px"
          }}
        >
          Este proyecto ya tiene {taskCount} tarea{taskCount === 1 ? "" : "s"}. Se enviarán los <b>títulos</b> de tus
          grupos y tareas para que el plan continúe desde ahí y no repita lo que ya hiciste. No se envía nada más.
        </div>
      )}

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={pending || objective.trim().length < 10}
        onClick={generar}
      >
        {pending ? "Pensando el plan…" : "Generar plan"}
      </button>

      <span className="text-xs" style={{ color: "var(--muted)" }}>
        Planes simples a propósito: como mucho {PLAN_LIMITS.groups} fases y {PLAN_LIMITS.tasksPerGroup} tareas por fase.
        El detalle lo pones tú en el tablero.
      </span>
    </div>
  );
}

/** Una fila del árbol. Existe para que las tres profundidades no divergan. */
function Row({
  checked,
  disabled = false,
  onChange,
  label,
  bold = false,
  muted = false,
  badge
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  label: string;
  bold?: boolean;
  muted?: boolean;
  badge?: string;
}) {
  return (
    <label
      className="text-sm"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 7,
        padding: "2px 0",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3, flexShrink: 0 }}
      />
      <span
        style={{
          overflowWrap: "anywhere",
          fontWeight: bold ? 700 : 400,
          fontSize: muted ? "0.82rem" : undefined,
          color: muted ? "var(--muted)" : undefined,
          textDecoration: checked ? undefined : "line-through"
        }}
      >
        {label}
        {badge && (
          <span className="chip accent" style={{ marginLeft: 6, verticalAlign: "middle" }}>
            {badge}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * Un plazo de partida a partir de la fecha objetivo del proyecto.
 *
 * Usa el reloj del navegador, y aquí sí vale: esto PRELLENA un campo de texto
 * libre que el usuario ve y corrige antes de enviarlo, no calcula nada que se
 * guarde. (Lo que sí exige la zona horaria del perfil es «hoy» en el tablero —
 * D-016 — y eso lo sigue dando el servidor.)
 */
function deadlineFromTargetDate(targetDate: string | null): { amount: number; unit: DeadlineUnit } {
  if (!targetDate) return { amount: 3, unit: "meses" };
  const dias = Math.round((new Date(`${targetDate}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  if (!Number.isFinite(dias) || dias < 7) return { amount: 3, unit: "meses" };
  if (dias <= 70) return { amount: Math.max(1, Math.round(dias / 7)), unit: "semanas" };
  return { amount: Math.max(1, Math.round(dias / 30)), unit: "meses" };
}

/**
 * Este panel se monta DENTRO del `<form>` de "Nuevo proyecto". Sin esto, un
 * Enter en el campo del plazo o en el de "¿qué cambiarías?" envía ESE
 * formulario y crea el proyecto a medio configurar, sin el plan.
 *
 * El corte va en el contenedor y no campo por campo para que añadir un input
 * aquí mañana no vuelva a abrir el agujero. El `textarea` se deja pasar: ahí
 * Enter es un salto de línea y nunca envía nada.
 */
function stopEnterSubmit(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Enter") return;
  if ((event.target as HTMLElement).tagName === "TEXTAREA") return;
  event.preventDefault();
}
