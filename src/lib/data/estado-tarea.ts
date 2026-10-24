import "server-only";
import { recordActivity } from "@/lib/data/activity";
import { dispatchAutomations } from "@/lib/automations/dispatch";
import { evaluateTransition } from "@/lib/domain/task-state.ts";
import type { TaskStatus } from "@/lib/domain/types.ts";
import { describeDbError } from "@/lib/supabase/errors";
import type { createClient } from "@/lib/supabase/server";
import { STATUS_META } from "@/app/(app)/execution/status-meta";

// Cambiar el estado de una tarea, en un solo sitio. Lo usan la Server Action
// setTaskStatus (un paso: Tablero, menús) y la ruta /api/execution/estado
// (varios pasos: lo que la Lista guarda tras su «Deshacer»).

type Supabase = Awaited<ReturnType<typeof createClient>>;

const PASOS_MAXIMOS = 4;
const ESTADOS = Object.keys(STATUS_META);

/** Un paso validado por la máquina de estados, con su historia, auditoría y automatizaciones. */
export async function aplicarPaso(supabase: Supabase, userId: string, taskId: string, to: TaskStatus) {
  const { data: task, error: taskErr } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (taskErr || !task) throw new Error("Tarea no encontrada");

  let depStatuses: Record<string, TaskStatus> = {};
  if (task.deps?.length) {
    const { data: deps } = await supabase.from("tasks").select("id, status").in("id", task.deps);
    depStatuses = Object.fromEntries((deps ?? []).map((d) => [d.id, d.status as TaskStatus]));
  }

  const result = evaluateTransition({ status: task.status as TaskStatus, deps: task.deps ?? [] }, to, depStatuses);
  if (!result.ok) throw new Error(result.message ?? "Transición no permitida");

  const { error } = await supabase
    .from("tasks")
    .update({ status: to, completed_at: to === "Completed" ? new Date().toISOString() : null, version: task.version + 1 })
    .eq("id", taskId);
  if (error) throw new Error(describeDbError(error));

  await supabase.from("task_history").insert({ task_id: taskId, from_state: task.status, to_state: to });
  await supabase.from("audit_log").insert({ user_id: userId, action: "task.status", object: taskId, meta: { to } });
  await recordActivity({
    projectId: task.project_id,
    type: "task.status",
    // Con el estado de origen, no solo el destino: «movió X a Bloqueada» no
    // dice si venía de trabajarse o de no haber empezado nunca.
    text: `movió "${task.title}" de ${STATUS_META[task.status as TaskStatus].label} a ${STATUS_META[to].label}`
  });

  // Al FINAL, y nunca lanza: el cambio de estado ya ocurrió y una regla rota no
  // puede deshacerlo ni presentarlo como un fallo.
  await dispatchAutomations({ type: "task.status_changed", taskId, projectId: task.project_id, toStatus: to });
}

/**
 * Varios pasos seguidos (Sin empezar → Trabajando → Hecho) en UNA petición.
 *
 * La Lista encadena toques y los guarda juntos tras el «Deshacer». Con una
 * petición por paso, salir de la app justo después dejaba el segundo sin
 * enviar y la tarea a medias. Cada paso se valida en orden; si uno falla, los
 * anteriores se quedan y se devuelve hasta dónde se llegó. Nunca lanza.
 */
export async function aplicarCamino(
  supabase: Supabase,
  userId: string,
  taskId: string,
  pasos: unknown
): Promise<{ ultimo: TaskStatus | null; error: string | null }> {
  if (!Array.isArray(pasos) || !pasos.length || pasos.length > PASOS_MAXIMOS || !pasos.every((p) => ESTADOS.includes(p))) {
    return { ultimo: null, error: "Pasos de estado no válidos" };
  }
  let ultimo: TaskStatus | null = null;
  for (const paso of pasos as TaskStatus[]) {
    try {
      await aplicarPaso(supabase, userId, taskId, paso);
      ultimo = paso;
    } catch (e) {
      return { ultimo, error: e instanceof Error ? e.message : "No se pudo cambiar el estado" };
    }
  }
  return { ultimo, error: null };
}
