// La FORMA de una plantilla de proyecto, y lo que se calcula con ella.
//
// EL CONTENIDO YA NO ESTÁ AQUÍ. Desde la migración 0044 el catálogo vive en
// `template_catalog` y lo administra un panel (/admin), porque añadir o
// corregir una plantilla no debería exigir un despliegue. Eso DEROGA D-044,
// que defendía justo lo contrario, y el porqué del cambio —qué se pierde y qué
// lo compensa— está escrito en la migración y en DECISIONS.md.
//
// Lo que queda en este archivo es lo que sigue siendo dominio puro: los tipos,
// la paleta de grupos y las dos funciones que traducen una plantilla a filas.
// Reciben el OBJETO, no el catálogo, así que se prueban sin levantar Postgres —
// que era la mitad buena de D-044 y no se ha perdido.
//
// LO QUE TAMPOCO CAMBIA: al usar una plantilla se COPIA a las tablas del
// usuario. Editarla en el panel no le reescribe el tablero a nadie que ya la
// hubiera aplicado.
//
// QUÉ NO TRAE UNA PLANTILLA, Y POR QUÉ
//
//   - FECHAS. El horizonte va en el NOMBRE del grupo («Fase 1 · Grind (mes
//     1-4)»), que es honesto porque no promete nada. Poner `due` sería inventar
//     un ritmo que no es de nadie, y al mes medio tablero aparecería vencido —
//     contando como atraso en Home y en el hecho `execution.overdue` del motor.
//   - `impact`. Ese flag alimenta «tres tareas de impacto» en Home y los
//     minutos comprometidos del día. Cuáles lo son ESTA semana es del usuario;
//     una plantilla que marca ocho lo rompe.
//   - `deps`. Exigen los ids de las tareas ya insertadas y no resuelven nada
//     que el orden de los grupos no diga ya. `suggestProjectSequence` sigue
//     estando para eso.
//
// Las tres ausencias las hace cumplir el esquema zod de
// `src/lib/domain/templates/schema.ts`, que es quien ocupó el puesto que tenía
// el compilador cuando el catálogo era un array de este archivo.

import type { Priority } from "../types.ts";

export interface ProjectTemplateTask {
  title: string;
  /** Sin declarar = `Medium`, el mismo default que `taskSchema`. */
  priority?: Priority;
  /** Heredan el grupo del padre al insertarse, como exige createTask. */
  subtasks?: string[];
}

export interface ProjectTemplateGroup {
  name: string;
  /** Token de color del design system, como `task_groups.color` (0019). */
  color: string;
  tasks: ProjectTemplateTask[];
}

/**
 * Para agrupar el selector. Con once plantillas, una lista plana obliga a
 * leerla entera para descartar diez; agrupada se salta al bloque que toca.
 */
export type ProjectTemplateCategory = "Trabajo y producto" | "Negocio" | "Marketing" | "Personal";

export const TEMPLATE_CATEGORIES: readonly ProjectTemplateCategory[] = [
  "Trabajo y producto",
  "Negocio",
  "Marketing",
  "Personal"
];

export interface ProjectTemplate {
  id: string;
  name: string;
  category: ProjectTemplateCategory;
  /** Una línea: qué proyecto es este y cuándo elegirlo. */
  summary: string;
  /** Libro y autor de los que sale la estructura, si los hay. Se atribuye. */
  source?: string;
  groups: ProjectTemplateGroup[];
}

/**
 * La paleta de grupos, en el orden en que se reparte.
 *
 * Se exporta porque el plan generado con IA (`ai-plan.ts`) cicla esta MISMA
 * lista para colorear sus grupos. El color no lo elige el modelo: dejarle
 * inventar un `#hex` rompe el tema claro/oscuro, que se apoya en los tokens.
 */
export const GROUP_COLORS = [
  "var(--c-purple)",
  "var(--c-blue)",
  "var(--c-teal)",
  "var(--c-orange)",
  "var(--c-green)",
  "var(--c-pink)"
] as const;

export interface TemplateSummary {
  groups: number;
  tasks: number;
  subtasks: number;
}

/** Qué va a crear, para poder decirlo ANTES de crearlo. */
export function templateSummary(template: ProjectTemplate): TemplateSummary {
  let tasks = 0;
  let subtasks = 0;
  for (const group of template.groups) {
    tasks += group.tasks.length;
    for (const task of group.tasks) subtasks += task.subtasks?.length ?? 0;
  }
  return { groups: template.groups.length, tasks, subtasks };
}

export interface PlannedGroup {
  name: string;
  color: string;
  position: number;
  tasks: { title: string; priority: Priority; position: number; subtasks: string[] }[];
}

/**
 * Los grupos y tareas con su `position` ya calculada.
 *
 * `fromGroupPosition` es lo que hace correcto el «añadir al final»: aplicar una
 * plantilla sobre un proyecto que ya tiene grupos debe empezar DESPUÉS del
 * último, no en cero — si no, dos grupos comparten posición y el orden del
 * tablero pasa a depender de cuál devuelva antes la base.
 *
 * Las tareas, en cambio, siempre empiezan en 0: su posición es dentro de su
 * grupo, y el grupo es nuevo.
 */
export function plannedRows(template: ProjectTemplate, options: { fromGroupPosition?: number } = {}): PlannedGroup[] {
  const from = options.fromGroupPosition ?? 0;
  return template.groups.map((group, groupIndex) => ({
    name: group.name,
    color: group.color,
    position: from + groupIndex,
    tasks: group.tasks.map((task, taskIndex) => ({
      title: task.title,
      priority: task.priority ?? "Medium",
      position: taskIndex,
      subtasks: task.subtasks ?? []
    }))
  }));
}
