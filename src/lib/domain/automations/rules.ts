// src/lib/domain/automations/rules.ts
// Reglas de automatización — lógica pura, sin React ni Supabase (probada en
// tests/domain/automations-rules.test.ts).
//
// TODA la decisión vive aquí: qué reglas despierta un evento, si pueden
// ejecutarse y con qué parámetros. El despachador (lib/automations/dispatch.ts)
// solo obedece lo que este archivo devuelve. El modelo no interviene en ningún
// punto — una automatización que dispara según lo que un modelo entendió de una
// frase no es reproducible, y aquí se ejecutan acciones reales sobre los datos
// del usuario.

import type { TaskStatus } from "../types.ts";

export type TriggerType = "task.status_changed" | "task.assigned" | "comment.added";
export type ActionType = "create_task" | "set_status" | "log_entry" | "create_reminder";

export interface AutomationLike {
  id: string;
  name: string;
  enabled: boolean;
  /** FR-AUT-002: sin esto, una acción de impacto se propone en vez de correr. */
  authorized: boolean;
  triggerType: TriggerType;
  triggerParams: Record<string, unknown>;
  actionType: ActionType;
  actionParams: Record<string, unknown>;
}

/** Lo que una Server Action acaba de hacer, ya normalizado. */
export interface AutomationEvent {
  type: TriggerType;
  /** La tarea implicada. Null solo si el evento no tiene ninguna. */
  taskId: string | null;
  projectId: string | null;
  /** Estado al que se movió. Solo en `task.status_changed`. */
  toStatus?: TaskStatus;
  /** Solo en `comment.added`: si el comentario menciona al dueño de la regla. */
  mentionsMe?: boolean;
  /** Solo en `task.assigned`: si el dueño de la regla quedó entre los responsables. */
  assignedToMe?: boolean;
  /** Id del comentario, cuando el evento es uno. */
  commentId?: string;
}

/**
 * Acciones que CAMBIAN cosas que otros ven, frente a las que solo añaden algo
 * propio del usuario.
 *
 * Es la línea que traza FR-AUT-002. Anotar en tu bitácora o recordarte algo no
 * necesita permiso: nadie más lo nota y se deshace solo. Crear una tarea o
 * mover un estado sí — aparecen en el tablero del equipo y disparan sus propias
 * consecuencias.
 */
export function isImpactAction(action: ActionType): boolean {
  return action === "create_task" || action === "set_status";
}

export type Decision =
  | { kind: "run"; automation: AutomationLike }
  | { kind: "propose"; automation: AutomationLike; reason: string }
  | { kind: "skip"; automation: AutomationLike; reason: string };

function statusParam(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.length ? value : null;
}

/** ¿El evento encaja con los parámetros del disparador? */
function matchesTrigger(automation: AutomationLike, event: AutomationEvent): boolean {
  if (automation.triggerType !== event.type) return false;

  // Acotar por proyecto es opcional: sin él, la regla vale para todo el espacio.
  const proyecto = statusParam(automation.triggerParams, "projectId");
  if (proyecto && proyecto !== event.projectId) return false;

  switch (event.type) {
    case "task.status_changed": {
      const to = statusParam(automation.triggerParams, "to");
      return !to || to === event.toStatus;
    }
    case "task.assigned":
      // `soloAMi` por defecto NO: una regla sobre asignaciones ajenas es
      // legítima («cuando se asigne algo en este proyecto, anótalo»).
      return automation.triggerParams.soloAMi === true ? event.assignedToMe === true : true;
    case "comment.added":
      return automation.triggerParams.soloMenciones === true ? event.mentionsMe === true : true;
  }
}

/**
 * Una regla no puede dispararse a sí misma.
 *
 * Mover a Completed cuando algo se mueve a Completed es un bucle, y aunque el
 * despachador no vuelve a despacharse —ejecuta las acciones directamente, no a
 * través de las acciones que despachan—, esa garantía es estructural y se puede
 * romper el día que alguien la refactorice. Que la regla ni siquiera case es
 * una segunda barrera que no depende de cómo esté escrito el despachador.
 */
function isSelfInflicted(automation: AutomationLike, event: AutomationEvent): boolean {
  if (automation.triggerType !== "task.status_changed" || automation.actionType !== "set_status") return false;
  const destino = statusParam(automation.actionParams, "to");
  return destino !== null && destino === event.toStatus;
}

/**
 * Qué hacer con cada regla del usuario ante un evento.
 *
 * Devuelve TODAS las decisiones, no solo las ejecutables: `propose` y `skip`
 * también se registran en `automation_runs`, porque una regla que no hizo nada
 * y no dejó rastro es una regla que el usuario cree rota.
 */
export function decide(event: AutomationEvent, automations: readonly AutomationLike[]): Decision[] {
  const decisions: Decision[] = [];

  for (const automation of automations) {
    if (!automation.enabled) continue;
    if (!matchesTrigger(automation, event)) continue;

    if (isSelfInflicted(automation, event)) {
      decisions.push({ kind: "skip", automation, reason: "La acción repetiría el evento que la disparó." });
      continue;
    }

    const invalido = validateAction(automation);
    if (invalido) {
      decisions.push({ kind: "skip", automation, reason: invalido });
      continue;
    }

    if (isImpactAction(automation.actionType) && !automation.authorized) {
      decisions.push({
        kind: "propose",
        automation,
        reason: "Acción de impacto sin autorizar: se propone en vez de ejecutarse (FR-AUT-002)."
      });
      continue;
    }

    decisions.push({ kind: "run", automation });
  }

  return decisions;
}

/**
 * ¿La acción tiene lo que necesita para correr? Devuelve el motivo si no.
 *
 * Se valida AQUÍ y no al guardar la regla porque los parámetros viven en
 * `jsonb`: la base acepta cualquier forma, y una regla guardada hace meses
 * puede haber quedado incompleta si el formulario cambió.
 */
export function validateAction(automation: AutomationLike): string | null {
  const p = automation.actionParams;
  switch (automation.actionType) {
    case "create_task":
      return statusParam(p, "title") ? null : "La acción no dice qué tarea crear.";
    case "set_status":
      return statusParam(p, "to") ? null : "La acción no dice a qué estado mover.";
    case "log_entry":
      return statusParam(p, "text") ? null : "La acción no dice qué anotar.";
    case "create_reminder":
      return statusParam(p, "preset") ? null : "La acción no dice para cuándo.";
  }
}

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  "task.status_changed": "Cuando una tarea cambia de estado",
  "task.assigned": "Cuando se asignan responsables",
  "comment.added": "Cuando alguien comenta"
};

export const ACTION_LABEL: Record<ActionType, string> = {
  create_task: "Crear una tarea",
  set_status: "Mover la tarea de estado",
  log_entry: "Anotar en la bitácora",
  create_reminder: "Crear un recordatorio"
};
