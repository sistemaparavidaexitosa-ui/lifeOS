"use server";
// Aplicar una plantilla a un proyecto.
//
// AÑADE, NUNCA REEMPLAZA. Los grupos de la plantilla van DESPUÉS de los que ya
// hay, y no se borra nada. La alternativa —limpiar el tablero y poner la
// plantilla— es irreversible: se llevaría por delante las tareas con sus
// comentarios, archivos y responsables. Lo que sobre se borra a mano, que sí se
// puede deshacer una fila a la vez.
//
// Aplicar dos veces duplica, y eso no se impide desde aquí: puede ser lo que el
// usuario quiere (dos fases iguales de un proyecto largo). Quien avisa es la
// interfaz, que sabe cuántas tareas hay ya.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProjectTemplate, plannedRows } from "@/lib/domain/execution/project-templates.ts";

export interface TemplateResult {
  ok: boolean;
  reason?: string;
  /** Lo que se creó, para poder decirlo al terminar. */
  created?: { groups: number; tasks: number };
}

const schema = z.object({ projectId: z.string().uuid(), templateId: z.string().min(1) });

export async function applyProjectTemplate(projectId: string, templateId: string): Promise<TemplateResult> {
  const parsed = schema.safeParse({ projectId, templateId });
  if (!parsed.success) return { ok: false, reason: "Proyecto o plantilla no válidos." };

  const template = getProjectTemplate(parsed.data.templateId);
  if (!template) return { ok: false, reason: "Esa plantilla ya no existe." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const result = await writeTemplate(supabase, parsed.data.projectId, template, user.id);
  if (result.ok) {
    revalidatePath("/execution");
    revalidatePath("/home");
  }
  return result;
}

type Db = Awaited<ReturnType<typeof createClient>>;
type Template = NonNullable<ReturnType<typeof getProjectTemplate>>;

/**
 * La escritura, separada para que `createProject` pueda reusarla sin volver a
 * comprobar la sesión ni revalidar dos veces.
 *
 * Si algo falla después de crear los grupos, se borran los grupos recién
 * insertados. Es el mismo criterio que `createRoutineFromTemplate`: media
 * plantilla es peor que ninguna, porque obliga a limpiar a mano antes de poder
 * reintentar. Solo se borran LOS NUEVOS — los que ya estaban ahí no se tocan.
 */
export async function writeTemplate(
  supabase: Db,
  projectId: string,
  template: Template,
  userId: string
): Promise<TemplateResult> {
  // Dónde empieza a añadir. Sin esto, dos grupos compartirían posición y el
  // orden del tablero pasaría a depender de cuál devuelva antes la base.
  const { data: ultimo } = await supabase
    .from("task_groups")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const desde = ultimo ? ultimo.position + 1 : 0;
  const planned = plannedRows(template, { fromGroupPosition: desde });

  const { data: grupos, error: errorGrupos } = await supabase
    .from("task_groups")
    .insert(planned.map((g) => ({ project_id: projectId, name: g.name, color: g.color, position: g.position })))
    .select("id, position");
  if (errorGrupos || !grupos?.length) {
    return { ok: false, reason: errorGrupos?.message ?? "No se pudieron crear los grupos." };
  }

  const idPorPosicion = new Map(grupos.map((g) => [g.position, g.id]));
  const nuevosGrupos = grupos.map((g) => g.id);

  const deshacer = async (motivo: string): Promise<TemplateResult> => {
    await supabase.from("task_groups").delete().in("id", nuevosGrupos);
    return { ok: false, reason: motivo };
  };

  // Las tareas raíz de todos los grupos, en un solo insert.
  const raices = planned.flatMap((g) =>
    g.tasks.map((t) => ({
      project_id: projectId,
      group_id: idPorPosicion.get(g.position) ?? null,
      title: t.title,
      priority: t.priority,
      position: t.position
    }))
  );

  const { data: creadas, error: errorTareas } = await supabase.from("tasks").insert(raices).select("id, title, group_id");
  if (errorTareas || !creadas?.length) {
    return deshacer(errorTareas?.message ?? "No se pudieron crear las tareas.");
  }

  // Las subtareas heredan el group_id del padre, SIEMPRE: es lo que ya
  // documenta createTask, y lo que hace que una subtarea se pinte dentro del
  // mismo grupo que su tarea en el tablero.
  const conSub = planned.flatMap((g) => g.tasks.filter((t) => t.subtasks.length).map((t) => ({ grupo: g.position, t })));
  const subtareas = conSub.flatMap(({ grupo, t }) => {
    const groupId = idPorPosicion.get(grupo) ?? null;
    const padre = creadas.find((c) => c.title === t.title && c.group_id === groupId);
    if (!padre) return [];
    return t.subtasks.map((title, index) => ({
      project_id: projectId,
      group_id: groupId,
      parent_task_id: padre.id,
      title,
      position: index
    }));
  });

  let subCreadas: { id: string }[] = [];
  if (subtareas.length) {
    const { data, error } = await supabase.from("tasks").insert(subtareas).select("id");
    if (error) return deshacer(error.message);
    subCreadas = data ?? [];
  }

  // Su primer punto de historial, igual que createTask. Sin esto, una tarea de
  // plantilla abre el hilo unificado en blanco y parece que nunca se creó.
  const todas = [...creadas.map((c) => c.id), ...subCreadas.map((s) => s.id)];
  await supabase.from("task_history").insert(todas.map((id) => ({ task_id: id, from_state: null, to_state: "Pending" })));

  await supabase
    .from("audit_log")
    .insert({ user_id: userId, action: "project.template", object: projectId, meta: { template: template.id } });

  return { ok: true, created: { groups: grupos.length, tasks: todas.length } };
}
