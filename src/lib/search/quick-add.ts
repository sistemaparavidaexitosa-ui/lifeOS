"use server";

import { revalidatePath } from "next/cache";
import { createTask } from "@/app/(app)/execution/actions";

/**
 * Crear una tarea desde la paleta, sin salir de donde estés.
 *
 * REUSA `createTask` en vez de insertar por su cuenta. Esa acción hace cosas
 * que desde fuera no se ven y que una tarea creada a mano se saltaría: asignar
 * el grupo del tablero (ninguna tarea puede quedar huérfana desde 0019),
 * escribir la posición y dejar la primera fila de `task_history`. Duplicar el
 * insert habría creado tareas de segunda categoría.
 *
 * El proyecto: el primero del espacio, por fecha de creación. Preguntar cuál
 * mataría la gracia —el sentido de esto es apuntar algo en dos segundos— y el
 * usuario aterriza en el drawer de la tarea recién creada, donde puede moverla.
 */
export interface QuickAddResult {
  ok: boolean;
  taskId?: string;
  reason?: string;
}

export async function quickAddTask(workspaceId: string, title: string): Promise<QuickAddResult> {
  const limpio = title.trim();
  if (limpio.length < 2) return { ok: false, reason: "Escribe algo más para poder crearla." };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!project) {
    return { ok: false, reason: "Este espacio todavía no tiene ningún proyecto donde poner la tarea." };
  }

  const form = new FormData();
  form.set("projectId", project.id);
  form.set("title", limpio);

  try {
    const row = await createTask(form);
    revalidatePath("/execution");
    revalidatePath("/home");
    return { ok: true, taskId: row.id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "No se pudo crear la tarea." };
  }
}
