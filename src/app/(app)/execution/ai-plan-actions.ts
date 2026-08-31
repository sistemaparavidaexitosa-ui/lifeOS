"use server";
// Generar un plan de proyecto con IA, y aplicarlo.
//
// Son DOS acciones y no una a propósito: entre pedir el plan y escribirlo está
// el usuario mirándolo. `requestAiPlan` no escribe NADA —ni una fila, ni un
// borrador guardado—, así que un plan que no convence sale gratis y no deja
// rastro que haya que limpiar después.
//
// Cuando el usuario confirma, `applyAiPlan` convierte lo que quedó marcado en
// un `ProjectTemplate` y lo escribe con `writeTemplate`, que es EL MISMO camino
// que usa el catálogo de plantillas. Por eso hereda gratis todo lo que ya está
// resuelto ahí: añadir al final sin tocar lo existente, el rollback si algo
// falla a mitad, el primer punto de `task_history` de cada tarea y el
// `audit_log`. Un camino de inserción propio para la IA sería una segunda
// implementación de eso mismo, condenada a divergir.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/data/activity";
import { planProject } from "@/lib/ai/plan-project";
import { selectionToTemplate, type AiPlanDraft } from "@/lib/domain/execution/ai-plan.ts";
import { writeTemplate, type TemplateResult } from "./template-actions";

/** Cuántos títulos del tablero actual se le enseñan al modelo. */
const MAX_CONTEXT_TASKS = 120;

const requestSchema = z.object({
  projectId: z.string().uuid().nullable(),
  objective: z.string().trim().min(10, "Cuenta un poco más del objetivo: con una palabra no se puede planear.").max(2000),
  deadline: z.string().trim().min(1).max(60),
  refinement: z.string().trim().max(500).optional()
});

export interface RequestPlanResult {
  ok: boolean;
  plan?: AiPlanDraft;
  reason?: string;
}

/**
 * Pide el plan. No escribe nada.
 *
 * `projectId` es `null` cuando el proyecto todavía no existe: se está creando
 * y el plan se previsualiza ANTES de crearlo. En ese caso no hay estructura
 * actual que enseñar, y el modelo planea desde cero.
 */
export async function requestAiPlan(input: {
  projectId: string | null;
  objective: string;
  deadline: string;
  refinement?: string;
}): Promise<RequestPlanResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "Faltan datos para generar el plan." };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const existingOutline = parsed.data.projectId ? await readOutline(supabase, parsed.data.projectId) : undefined;

  return planProject({
    objective: parsed.data.objective,
    deadline: parsed.data.deadline,
    refinement: parsed.data.refinement,
    existingOutline
  });
}

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Lo que ya hay en el tablero, para que el plan continúe en vez de repetirlo.
 *
 * SOLO TÍTULOS. No salen de aquí ids, responsables, fechas, comentarios ni
 * estados: el modelo necesita saber qué está cubierto, no quién lo hace ni
 * cuándo. Es el mismo criterio de mínimo necesario que aplica `context.ts` en
 * Intelligence OS.
 *
 * Si la lectura falla, devuelve `undefined` y el plan se genera sin contexto:
 * un plan que repite algo es peor que uno bueno, pero mucho mejor que un error
 * en la cara.
 */
async function readOutline(supabase: Db, projectId: string): Promise<{ group: string; tasks: string[] }[] | undefined> {
  // RLS ya decide si este usuario alcanza el proyecto: si no lo alcanza, estas
  // consultas vuelven vacías y no hay nada que filtrar a mano.
  const [{ data: groups }, { data: tasks }] = await Promise.all([
    supabase.from("task_groups").select("id, name, position").eq("project_id", projectId).order("position"),
    supabase
      .from("tasks")
      .select("title, group_id, parent_task_id, position")
      .eq("project_id", projectId)
      .is("parent_task_id", null)
      .order("position")
      .limit(MAX_CONTEXT_TASKS)
  ]);

  if (!groups?.length) return undefined;

  const outline = groups.map((g) => ({
    group: g.name,
    tasks: (tasks ?? []).filter((t) => t.group_id === g.id).map((t) => t.title)
  }));

  // Un tablero de puros grupos vacíos no es contexto: es ruido que empujaría
  // al modelo a "continuar" un proyecto en el que no se ha hecho nada.
  return outline.some((g) => g.tasks.length) ? outline : undefined;
}

/**
 * Escribe el plan podado. Los grupos van DESPUÉS de los que ya hay; nada de lo
 * existente se borra ni se mueve.
 */
export async function applyAiPlan(
  projectId: string,
  draft: AiPlanDraft,
  selection: string[]
): Promise<TemplateResult> {
  const id = z.string().uuid().safeParse(projectId);
  if (!id.success) return { ok: false, reason: "Proyecto no válido." };

  const template = selectionToTemplate(draft, new Set(selection));
  if (!template) return { ok: false, reason: "No queda nada marcado que añadir al proyecto." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const result = await writeTemplate(supabase, id.data, template, user.id);
  if (result.ok) {
    await recordActivity({
      projectId: id.data,
      type: "ai.plan",
      text: `generó un plan con IA (${result.created?.groups ?? 0} grupos, ${result.created?.tasks ?? 0} tareas)`
    });
    revalidatePath("/execution");
    revalidatePath("/home");
  }
  return result;
}
