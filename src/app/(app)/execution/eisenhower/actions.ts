"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { changeQuadrant } from "@/lib/domain/eisenhower.ts";
import type { EisenhowerQuadrant, TaskStatus } from "@/lib/domain/types.ts";

/** FR-VIEW-008, BR-023: mover una burbuja actualiza urgent/priority y audita como un cambio de estado. */
export async function changeTaskQuadrant(taskId: string, targetQuadrant: EisenhowerQuadrant) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task, error: taskErr } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (taskErr || !task) throw new Error("Tarea no encontrada");

  const result = changeQuadrant({ status: task.status as TaskStatus }, targetQuadrant);
  if (!result.ok) throw new Error(result.message ?? "Cuadrante inválido");

  const beforeQuadrant = `${task.urgent}-${task.priority}`;
  const { error } = await supabase
    .from("tasks")
    .update({ urgent: result.urgent, priority: result.priority, version: task.version + 1 })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("task_history").insert({ task_id: taskId, from_state: `quadrant:${beforeQuadrant}`, to_state: `quadrant:${targetQuadrant}` });
  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.quadrant", object: taskId, meta: { to: targetQuadrant } });
  revalidatePath("/execution/eisenhower");
}
