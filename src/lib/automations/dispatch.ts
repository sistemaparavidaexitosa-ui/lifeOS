import "server-only";

import { createClient } from "@/lib/supabase/server";
import { evaluateTransition } from "@/lib/domain/task-state.ts";
import { presetDate, type ReminderPreset } from "@/lib/domain/execution/reminders.ts";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import {
  decide,
  type AutomationEvent,
  type AutomationLike,
  type Decision
} from "@/lib/domain/automations/rules.ts";
import type { TaskStatus } from "@/lib/domain/types.ts";

/**
 * Ejecuta las automatizaciones que despierta un evento.
 *
 * LA GARANTÍA CONTRA LOS BUCLES ES ESTRUCTURAL: este archivo ejecuta las
 * acciones DIRECTAMENTE contra la base, no llamando a las Server Actions que a
 * su vez despachan. Una automatización no puede provocar una segunda ronda,
 * porque no hay ninguna ronda que provocar. El dominio pone además una segunda
 * barrera (una regla que repetiría su propio disparo se salta), a propósito: la
 * garantía estructural depende de cómo esté escrito este archivo, y eso puede
 * cambiar el día que alguien lo refactorice.
 *
 * NUNCA LANZA. Se llama al final de acciones que ya hicieron su trabajo —
 * completar una tarea, dejar un comentario— y una automatización rota no puede
 * deshacer eso ni presentarlo como un fallo. Es el mismo contrato que `sendEmail`
 * (D-021) y que la escritura del feed de actividad.
 */
export async function dispatchAutomations(event: AutomationEvent): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: rows } = await supabase
      .from("automations")
      .select("id, name, enabled, authorized, trigger_type, trigger_params, action_type, action_params")
      .eq("user_id", user.id)
      .eq("enabled", true)
      .eq("trigger_type", event.type);

    if (!rows?.length) return;

    const automations: AutomationLike[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      authorized: r.authorized,
      triggerType: r.trigger_type as AutomationLike["triggerType"],
      triggerParams: (r.trigger_params ?? {}) as Record<string, unknown>,
      actionType: r.action_type as AutomationLike["actionType"],
      actionParams: (r.action_params ?? {}) as Record<string, unknown>
    }));

    // Toda la decisión viene del dominio. Aquí no se decide nada.
    for (const decision of decide(event, automations)) {
      await registrar(decision, event, user.id);
    }
  } catch {
    // Ver el contrato de arriba: una automatización rota no rompe la acción que
    // la provocó.
  }
}

async function registrar(decision: Decision, event: AutomationEvent, userId: string): Promise<void> {
  const supabase = await createClient();
  const automation = decision.automation;

  if (decision.kind !== "run") {
    await supabase.from("automation_runs").insert({
      automation_id: automation.id,
      result: automation.name,
      outcome: decision.kind === "propose" ? "proposed" : "skipped",
      subject_id: event.taskId ?? event.commentId ?? null,
      detail: decision.reason
    });
    return;
  }

  const resultado = await ejecutar(automation, event, userId);
  await supabase.from("automation_runs").insert({
    automation_id: automation.id,
    result: automation.name,
    outcome: resultado.ok ? "ran" : "failed",
    subject_id: event.taskId ?? event.commentId ?? null,
    detail: resultado.detail
  });
}

async function ejecutar(
  automation: AutomationLike,
  event: AutomationEvent,
  userId: string
): Promise<{ ok: boolean; detail: string }> {
  const supabase = await createClient();
  const p = automation.actionParams;
  const texto = (key: string) => (typeof p[key] === "string" ? (p[key] as string) : "");

  switch (automation.actionType) {
    case "log_entry": {
      if (!event.projectId) return { ok: false, detail: "El evento no pertenece a ningún proyecto." };
      const { error } = await supabase.from("logbook").insert({
        user_id: userId,
        project_id: event.projectId,
        type: texto("type") || "change",
        text: texto("text")
      });
      return error ? { ok: false, detail: error.message } : { ok: true, detail: "Anotado en la bitácora." };
    }

    case "create_reminder": {
      const subjectId = event.taskId ?? event.commentId;
      if (!subjectId) return { ok: false, detail: "El evento no tiene sujeto al que apuntar." };
      const today = todayLocal(await getUserTimeZone());
      const { error } = await supabase.from("reminders").insert({
        user_id: userId,
        subject_type: event.taskId ? "task" : "comment",
        subject_id: subjectId,
        text: texto("text"),
        remind_on: presetDate((texto("preset") || "manana") as ReminderPreset, today)
      });
      return error ? { ok: false, detail: error.message } : { ok: true, detail: "Recordatorio creado." };
    }

    case "create_task": {
      const projectId = texto("projectId") || event.projectId;
      if (!projectId) return { ok: false, detail: "No hay proyecto donde crear la tarea." };

      // El grupo, igual que hace createTask: ninguna tarea puede quedar
      // huérfana del tablero (0019).
      const { data: grupo } = await supabase
        .from("task_groups")
        .select("id")
        .eq("project_id", projectId)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

      const { data: creada, error } = await supabase
        .from("tasks")
        .insert({ project_id: projectId, title: texto("title"), group_id: grupo?.id ?? null })
        .select("id")
        .single();
      if (error || !creada) return { ok: false, detail: error?.message ?? "No se pudo crear." };

      await supabase.from("task_history").insert({ task_id: creada.id, from_state: null, to_state: "Pending" });
      return { ok: true, detail: `Tarea creada: ${texto("title")}` };
    }

    case "set_status": {
      if (!event.taskId) return { ok: false, detail: "El evento no señala ninguna tarea." };
      const destino = texto("to") as TaskStatus;

      const { data: task } = await supabase.from("tasks").select("*").eq("id", event.taskId).single();
      if (!task) return { ok: false, detail: "La tarea ya no existe." };
      if (task.status === destino) return { ok: true, detail: "Ya estaba en ese estado." };

      let depStatuses: Record<string, TaskStatus> = {};
      if (task.deps?.length) {
        const { data: deps } = await supabase.from("tasks").select("id, status").in("id", task.deps);
        depStatuses = Object.fromEntries((deps ?? []).map((d) => [d.id, d.status as TaskStatus]));
      }

      // La MISMA máquina de estados que el selector, el Kanban, el arrastre del
      // tablero y la reacción ✅. Una automatización no puede cerrar una tarea
      // con dependencias abiertas por el hecho de ser automática.
      const check = evaluateTransition({ status: task.status as TaskStatus, deps: task.deps ?? [] }, destino, depStatuses);
      if (!check.ok) return { ok: false, detail: check.message ?? "Transición no permitida." };

      const { error } = await supabase
        .from("tasks")
        .update({
          status: destino,
          completed_at: destino === "Completed" ? new Date().toISOString() : null,
          version: task.version + 1
        })
        .eq("id", event.taskId);
      if (error) return { ok: false, detail: error.message };

      await supabase.from("task_history").insert({ task_id: event.taskId, from_state: task.status, to_state: destino });
      return { ok: true, detail: `Movida a ${destino}.` };
    }
  }
}
