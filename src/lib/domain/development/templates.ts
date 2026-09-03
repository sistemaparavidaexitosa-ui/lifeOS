// La FORMA de una rutina y de un hábito de plantilla, y lo que se calcula con
// ellas.
//
// EL CONTENIDO YA NO ESTÁ AQUÍ. Desde la migración 0044 el catálogo vive en
// `template_catalog` y lo administra un panel (/admin): añadir o corregir una
// plantilla no debería exigir un despliegue. Eso DEROGA D-044, que defendía lo
// contrario; el porqué, con lo que se pierde y lo que lo compensa, está en la
// migración y en DECISIONS.md.
//
// Queda lo que sigue siendo dominio puro: los tipos, el orden de las categorías
// y las funciones que reciben el OBJETO de plantilla —no el catálogo— y por eso
// se prueban sin levantar Postgres.
//
// LO QUE NO CAMBIA: al usar una plantilla se COPIA a las tablas del usuario.
// Editarla en el panel no le reescribe los pasos a nadie.
//
// SOBRE LOS LIBROS EN LOS QUE SE APOYAN LAS PLANTILLAS SEMBRADAS
// Se usa su ESTRUCTURA, que es un hecho comprobable —que S.A.V.E.R.S. son seis
// prácticas o que la fórmula de Sharma parte la hora en tres bloques de veinte
// minutos—, y las descripciones están escritas con nuestras palabras. No se
// reproduce texto de ninguna de las obras. La atribución viaja en el campo
// `source`, que el esquema exige y la interfaz pinta.

import type { Frequency } from "./routines.ts";

export type HabitCategory = "Salud" | "Aprendizaje" | "Trabajo" | "Personal" | "Otros";

// =============================================================================
// RUTINAS
// =============================================================================

export interface RoutineTemplateStep {
  title: string;
  durationMin: number;
  /** Qué se hace en ese paso, en una línea. Se muestra al elegir la plantilla. */
  detail: string;
  /**
   * Texto con el que se intenta reconocer un hábito que el usuario YA tenga,
   * para ligar el paso a él (`routine_steps.habit_id`) en vez de duplicarlo.
   * La migración 0024 lo dice: la racha no se bifurca.
   */
  habitHint?: string;
}

export interface RoutineTemplate {
  id: string;
  name: string;
  /** Libro y autor de los que sale la estructura. Se muestra como atribución. */
  source: string;
  summary: string;
  frequency: Frequency;
  steps: RoutineTemplateStep[];
}

/** Minutos que suma la plantilla. Se muestra al elegirla y lo verifica una prueba. */
export function routineTemplateDuration(template: RoutineTemplate): number {
  return template.steps.reduce((sum, step) => sum + step.durationMin, 0);
}

// =============================================================================
// HÁBITOS
// =============================================================================

/**
 * «Hábitos atómicos» no da una lista de hábitos: da reglas para darles forma.
 * Por eso cada plantilla trae tres cosas además del nombre:
 *
 *   - `cue`: la intención de implementación — cuándo y después de qué. Un
 *     hábito sin momento no se ejecuta, se recuerda con culpa.
 *   - `twoMinVersion`: la versión que cabe en dos minutos y que no se puede
 *     fallar. Es la que se hace el día malo, y la que sostiene la racha.
 *   - `why`: en qué se apoya, para que quien elija la plantilla entienda la
 *     regla y pueda escribir la suya después.
 */
export interface HabitTemplate {
  id: string;
  name: string;
  category: HabitCategory;
  frequency: Frequency;
  cue: string;
  twoMinVersion: string;
  why: string;
}

/** Las plantillas agrupadas por categoría, en el orden en que se muestran. */
export const HABIT_CATEGORY_ORDER: readonly HabitCategory[] = ["Salud", "Aprendizaje", "Trabajo", "Personal", "Otros"];

/**
 * Agrupa por categoría, en el orden de arriba y sin grupos vacíos.
 *
 * Recibe la lista en vez de leer un array del módulo: desde 0044 el catálogo
 * viene de la base, y así esta función sigue siendo pura y probable con un
 * puñado de plantillas de mentira.
 */
export function habitTemplatesByCategory(
  templates: readonly HabitTemplate[]
): { category: HabitCategory; templates: HabitTemplate[] }[] {
  return HABIT_CATEGORY_ORDER.map((category) => ({
    category,
    templates: templates.filter((t) => t.category === category)
  })).filter((group) => group.templates.length > 0);
}

/**
 * Busca, entre los hábitos que el usuario ya tiene, uno que corresponda al paso
 * de una plantilla de rutina. Comparación laxa a propósito —sin acentos, sin
 * mayúsculas y por inclusión— porque el usuario escribió "Leer 20 min" y la
 * plantilla dice "leer": exigir igualdad exacta nunca encontraría nada, y el
 * coste de fallar es solo que el paso no queda ligado.
 */
export function matchHabitForStep(
  hint: string | undefined,
  habits: { id: string; name: string }[]
): string | null {
  if (!hint) return null;
  const objetivo = normalizar(hint);
  if (!objetivo) return null;

  const encontrado = habits.find((h) => {
    const nombre = normalizar(h.name);
    return nombre.includes(objetivo) || objetivo.includes(nombre);
  });
  return encontrado?.id ?? null;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    // Rango de diacríticos combinantes, escrito con escapes y no con los
    // caracteres literales: pegados en el archivo son invisibles y cualquier
    // reformateo los puede comer sin que se note.
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
