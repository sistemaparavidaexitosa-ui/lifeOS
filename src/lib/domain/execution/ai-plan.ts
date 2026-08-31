// El plan de proyecto generado con IA, saneado y convertido en plantilla.
//
// POR QUÉ ES DOMINIO PURO
// Mismo criterio que `insights/anchoring.ts`: lo que separa al modelo de la
// base de datos tiene que poder probarse SIN red y SIN Postgres, porque es la
// última línea de defensa. Aquí no se importa Supabase, ni el SDK, ni nada de
// `app/`. Entra un objeto sin forma —lo que sea que haya devuelto el modelo— y
// sale un `ProjectTemplate`, que es la única forma que `writeTemplate` sabe
// escribir.
//
// QUÉ NO PUEDE SALIR DE AQUÍ, Y POR QUÉ
//
//   - FECHAS. Ni `due` ni `start`, dijera lo que dijera el modelo. Es la misma
//     razón que documenta el catálogo de plantillas: un plazo repartido en
//     fechas inventadas deja medio tablero vencido al mes, y ese atraso falso
//     se cuela en Home y en el hecho `execution.overdue` del motor. El plazo
//     vive en el NOMBRE del grupo («Fase 2 · Construcción (semanas 4-9)»),
//     que informa sin prometer.
//   - COLORES DEL MODELO. Se ciclan los tokens de `GROUP_COLORS`. Un `#hex`
//     inventado se ve bien en un tema y se pierde en el otro.
//   - `impact` y `deps`, por lo que ya dice `project-templates.ts`.
//
// SANEAR ES RECORTAR, NO RECHAZAR. Un plan con nueve grupos no es un error del
// que haya que informar: es un plan largo. Se queda en seis y se sigue. Tirar
// la respuesta entera obligaría al usuario a pagar otra llamada para arreglar
// algo que se arregla aquí.

import type { Priority } from "../types.ts";
import { GROUP_COLORS, type ProjectTemplate } from "./project-templates.ts";

/**
 * Los topes de «plan simple». No son un capricho de rendimiento: el encargo es
 * que la IA dé ESTRUCTURA, y un tablero que nace con sesenta filas no es una
 * estructura, es una lista que hay que podar antes de poder usarla.
 */
export const PLAN_LIMITS = {
  groups: 6,
  tasksPerGroup: 6,
  subtasksPerTask: 4,
  /** Tareas raíz en todo el plan. 6x6 daría 36; se corta antes. */
  totalTasks: 30,
  /** `tasks.title` y `task_groups.name` son varchar(200) en la base. */
  titleLength: 200
} as const;

export interface AiPlanTask {
  title: string;
  priority: Priority;
  subtasks: string[];
}

export interface AiPlanGroup {
  name: string;
  /** Siempre un token de `GROUP_COLORS`. Nunca lo elige el modelo. */
  color: string;
  tasks: AiPlanTask[];
}

export interface AiPlanDraft {
  /** Nombre corto del plan, para la cabecera de la previsualización. */
  name: string;
  /** Una línea sobre el enfoque que tomó. Puede venir vacía. */
  summary: string;
  groups: AiPlanGroup[];
}

const PRIORITIES: readonly Priority[] = ["High", "Medium", "Low"];

/** Normaliza para comparar: es lo que hace que «Hacer algo» y «hacer  algo» choquen. */
function fingerprint(title: string): string {
  return title.toLowerCase().normalize("NFKD").replace(/\s+/g, " ").trim();
}

/**
 * Un título utilizable, o `null`.
 *
 * Colapsa los espacios (el modelo a veces devuelve saltos de línea dentro del
 * título) y recorta al ancho de la columna: 200 caracteres exactos, porque
 * pasarse hace que el INSERT falle entero y se pierda el plan completo por una
 * sola fila larga.
 */
function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const limpio = value.replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  return limpio.slice(0, PLAN_LIMITS.titleLength);
}

function cleanPriority(value: unknown): Priority {
  return PRIORITIES.includes(value as Priority) ? (value as Priority) : "Medium";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * De lo que devolvió el modelo a un borrador con el que se puede trabajar.
 *
 * Nunca lanza: recibe `unknown` a propósito, porque aunque el esquema del SDK
 * ya valide la forma, esta función es lo que garantiza las REGLAS —topes,
 * colores, ausencia de fechas— y esas no las puede garantizar un esquema.
 */
export function sanitizePlan(raw: unknown): AiPlanDraft {
  const plan = asRecord(raw);
  const groups: AiPlanGroup[] = [];
  let totalTasks = 0;

  for (const rawGroup of asArray(plan.groups)) {
    if (groups.length >= PLAN_LIMITS.groups) break;
    if (totalTasks >= PLAN_LIMITS.totalTasks) break;

    const group = asRecord(rawGroup);
    const name = cleanTitle(group.name);
    if (!name) continue;

    // La deduplicación es POR GRUPO, no global: «Revisar resultados» al final
    // de dos fases distintas son dos tareas distintas, y borrar la segunda
    // dejaría la fase coja.
    const vistos = new Set<string>();
    const tasks: AiPlanTask[] = [];

    for (const rawTask of asArray(group.tasks)) {
      if (tasks.length >= PLAN_LIMITS.tasksPerGroup) break;
      if (totalTasks >= PLAN_LIMITS.totalTasks) break;

      const task = asRecord(rawTask);
      const title = cleanTitle(task.title);
      if (!title) continue;

      const huella = fingerprint(title);
      if (vistos.has(huella)) continue;
      vistos.add(huella);

      const subVistos = new Set<string>();
      const subtasks: string[] = [];
      for (const rawSub of asArray(task.subtasks)) {
        if (subtasks.length >= PLAN_LIMITS.subtasksPerTask) break;
        const sub = cleanTitle(rawSub);
        if (!sub) continue;
        const subHuella = fingerprint(sub);
        // Una subtarea que repite el título de su padre no descompone nada.
        if (subHuella === huella || subVistos.has(subHuella)) continue;
        subVistos.add(subHuella);
        subtasks.push(sub);
      }

      // Se construye una tarea NUEVA con solo estos tres campos. Es lo que
      // impide que un `due` del modelo llegue al tablero: no se copia el
      // objeto, se elige qué se lleva.
      tasks.push({ title, priority: cleanPriority(task.priority), subtasks });
      totalTasks += 1;
    }

    // Un grupo sin tareas es una fila vacía que el usuario tendría que borrar
    // a mano. No se crea.
    if (!tasks.length) continue;

    // El `?? GROUP_COLORS[0]` no es defensivo de verdad —el módulo siempre cae
    // dentro— pero un índice calculado ensancha el tipo del tupla a
    // `string | undefined` y el compilador lo rechaza sin esta salida.
    groups.push({ name, color: GROUP_COLORS[groups.length % GROUP_COLORS.length] ?? GROUP_COLORS[0], tasks });
  }

  return {
    name: cleanTitle(plan.name) ?? "Plan generado con IA",
    summary: cleanTitle(plan.summary) ?? "",
    groups
  };
}

// ===========================================================================
// La selección: qué de todo eso se inserta
// ===========================================================================

/**
 * La selección es un conjunto de rutas (`"g0"`, `"g0.t1"`, `"g0.t1.s2"`) y no
 * un árbol de booleanos paralelo. Un `Set<string>` en el estado de React se
 * copia y se compara sin recorrer nada, y no puede desincronizarse de la forma
 * del borrador —que es inmutable mientras el panel está abierto.
 */
export type PlanSelection = ReadonlySet<string>;

export const groupKey = (g: number): string => `g${g}`;
export const taskKey = (g: number, t: number): string => `g${g}.t${t}`;
export const subtaskKey = (g: number, t: number, s: number): string => `g${g}.t${t}.s${s}`;

/** Todo marcado. Es el estado inicial del panel: el usuario quita, no añade. */
export function fullSelection(draft: AiPlanDraft): Set<string> {
  const sel = new Set<string>();
  draft.groups.forEach((group, g) => {
    sel.add(groupKey(g));
    group.tasks.forEach((task, t) => {
      sel.add(taskKey(g, t));
      task.subtasks.forEach((_, s) => sel.add(subtaskKey(g, t, s)));
    });
  });
  return sel;
}

export interface PlanCounts {
  groups: number;
  tasks: number;
  subtasks: number;
}

/**
 * Qué va a crear la selección actual, ANTES de crearla. Gemelo de
 * `templateSummary`, y se calcula recorriendo lo MISMO que
 * `selectionToTemplate` para que el número del botón no pueda mentir.
 */
export function planSummary(draft: AiPlanDraft, selection: PlanSelection): PlanCounts {
  const template = selectionToTemplate(draft, selection);
  if (!template) return { groups: 0, tasks: 0, subtasks: 0 };
  let tasks = 0;
  let subtasks = 0;
  for (const group of template.groups) {
    tasks += group.tasks.length;
    for (const task of group.tasks) subtasks += task.subtasks?.length ?? 0;
  }
  return { groups: template.groups.length, tasks, subtasks };
}

/**
 * El borrador podado, con la forma que `writeTemplate` ya sabe escribir.
 *
 * La herencia es hacia abajo y solo hacia abajo: desmarcar un grupo se lleva
 * sus tareas, desmarcar una tarea se lleva sus subtareas, y desmarcar una
 * subtarea no toca a su padre. Es lo que la gente espera de un árbol de
 * casillas, y lo contrario —que quitar una subtarea arrastre a la tarea— haría
 * imposible quedarse con la tarea y descartar un paso suyo.
 *
 * Devuelve `null` si no queda nada: una plantilla de cero grupos haría que
 * `writeTemplate` fallara contra un INSERT vacío, y el usuario vería un error
 * de base de datos en vez de un botón deshabilitado.
 */
export function selectionToTemplate(draft: AiPlanDraft, selection: PlanSelection): ProjectTemplate | null {
  const groups = draft.groups.flatMap((group, g) => {
    if (!selection.has(groupKey(g))) return [];

    const tasks = group.tasks.flatMap((task, t) => {
      if (!selection.has(taskKey(g, t))) return [];
      return [
        {
          title: task.title,
          priority: task.priority,
          subtasks: task.subtasks.filter((_, s) => selection.has(subtaskKey(g, t, s)))
        }
      ];
    });

    if (!tasks.length) return [];
    return [{ name: group.name, color: group.color, tasks }];
  });

  if (!groups.length) return null;

  // `id: "ai"` es lo que acaba en `audit_log.meta.template`, y por eso importa
  // que sea estable: es cómo se distingue después un tablero nacido de la IA de
  // uno nacido del catálogo.
  return {
    id: "ai",
    category: "Trabajo y producto",
    name: draft.name,
    summary: draft.summary,
    groups
  };
}

/**
 * El plan que viaja DENTRO del formulario de "Nuevo proyecto", en un campo
 * oculto, porque ahí el proyecto todavía no existe y no hay `projectId` al que
 * aplicárselo.
 *
 * Se vuelve a sanear en el servidor aunque el borrador ya saliera saneado de
 * `planProject`: entre medias pasó por el navegador, y lo que llega en un
 * `FormData` es entrada del usuario. `sanitizePlan` es idempotente, así que
 * volver a pasarlo no cambia un plan legítimo ni desplaza los índices a los que
 * apunta la selección.
 */
export function templateFromPayload(raw: unknown): ProjectTemplate | null {
  const payload = asRecord(raw);
  const selection = asArray(payload.selection).filter((key): key is string => typeof key === "string");
  return selectionToTemplate(sanitizePlan(payload.draft), new Set(selection));
}
