// Catálogo de plantillas de rutinas y hábitos.
//
// POR QUÉ VIVE EN CÓDIGO Y NO EN LA BASE
// Esto es CONTENIDO, no datos del usuario: no tiene dueño, no lleva RLS y no
// cambia por persona. En código va versionado en git, se prueba sin levantar
// Postgres y no puede divergir entre entornos — que es justo lo que pasaría
// con un catálogo sembrado que alguien edita en producción.
//
// Al usar una plantilla se COPIA a las tablas del usuario. A partir de ahí es
// suya: editarla no toca el catálogo, y cambiar el catálogo no le reescribe
// nada a nadie.
//
// SOBRE LOS LIBROS EN LOS QUE SE APOYA
// Se usa su ESTRUCTURA, que es un hecho comprobable —que S.A.V.E.R.S. son seis
// prácticas o que la fórmula de Sharma parte la hora en tres bloques de veinte
// minutos—, y las descripciones están escritas aquí, con nuestras palabras. No
// se reproduce texto de ninguna de las tres obras.

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
   * para NO sembrarlo de nuevo al usar la plantilla. Desde 0045 el paso ES el
   * hábito, así que aquí ya no hay nada que ligar —solo evitar el duplicado
   * que bifurcaría la racha en dos filas con el mismo nombre.
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

export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = [
  {
    id: "savers-60",
    name: "Mañana Milagrosa · S.A.V.E.R.S.",
    source: "Mañana Milagrosa, de Hal Elrod",
    summary:
      "Seis prácticas de diez minutos antes de que empiece el día de los demás. El orden importa menos que hacerlas las seis.",
    frequency: "Diario",
    steps: [
      { title: "Silencio", durationMin: 10, detail: "Sentarse sin pantalla: respirar, meditar o simplemente estar callado.", habitHint: "meditar" },
      { title: "Afirmaciones", durationMin: 10, detail: "Leer en voz alta lo que quieres sostener hoy, escrito por ti y en presente." },
      { title: "Visualización", durationMin: 10, detail: "Imaginar con detalle cómo se ve el día saliendo bien, no solo el resultado." },
      { title: "Ejercicio", durationMin: 10, detail: "Mover el cuerpo lo suficiente para notarlo. No es el entrenamiento del día, es despertarse.", habitHint: "ejercicio" },
      { title: "Lectura", durationMin: 10, detail: "Diez páginas de algo que te enseñe algo.", habitHint: "leer" },
      { title: "Escritura", durationMin: 10, detail: "Escribir lo que traes en la cabeza, sin editarlo. Sirve para vaciarla." }
    ]
  },
  {
    id: "savers-6",
    name: "Mañana Milagrosa · versión de 6 minutos",
    source: "Mañana Milagrosa, de Hal Elrod",
    // Esta plantilla no es relleno. Es la que sobrevive a una mala semana: sin
    // una versión que quepa en seis minutos, la de sesenta se abandona el
    // primer día que uno se levanta tarde, y abandonarla un día es como se
    // abandona del todo.
    summary:
      "Las mismas seis prácticas, un minuto cada una. Es la versión para el día que te levantas tarde — y existe para que ese día no rompas la racha.",
    frequency: "Diario",
    steps: [
      { title: "Silencio", durationMin: 1, detail: "Un minuto de respiración, sin tocar el teléfono.", habitHint: "meditar" },
      { title: "Afirmaciones", durationMin: 1, detail: "Leer tus afirmaciones una vez." },
      { title: "Visualización", durationMin: 1, detail: "Ver el día saliendo bien." },
      { title: "Ejercicio", durationMin: 1, detail: "Sesenta segundos de algo que suba el pulso.", habitHint: "ejercicio" },
      { title: "Lectura", durationMin: 1, detail: "Una página.", habitHint: "leer" },
      { title: "Escritura", durationMin: 1, detail: "Una frase de lo que agradeces o de lo que te preocupa." }
    ]
  },
  {
    id: "club-5am",
    name: "El Club de las 5 AM · Fórmula 20/20/20",
    source: "El Club de las 5 de la mañana, de Robin Sharma",
    summary:
      "La primera hora partida en tres bloques de veinte minutos: mover el cuerpo, ordenar la cabeza y aprender algo.",
    frequency: "Diario",
    steps: [
      {
        title: "Moverse",
        durationMin: 20,
        detail: "Ejercicio intenso, hasta sudar. La idea es empezar el día con el cuerpo ya encendido.",
        habitHint: "ejercicio"
      },
      {
        title: "Reflexionar",
        durationMin: 20,
        detail: "Diario, meditación o planear el día. Sin pantallas y sin correo.",
        habitHint: "diario"
      },
      {
        title: "Crecer",
        durationMin: 20,
        detail: "Aprender algo deliberadamente: un libro, un curso, un pódcast con cuaderno al lado.",
        habitHint: "leer"
      }
    ]
  }
];

/** Minutos que suma la plantilla. Se muestra al elegirla y lo verifica una prueba. */
export function routineTemplateDuration(template: RoutineTemplate): number {
  return template.steps.reduce((sum, step) => sum + step.durationMin, 0);
}

export function getRoutineTemplate(id: string): RoutineTemplate | undefined {
  return ROUTINE_TEMPLATES.find((t) => t.id === id);
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
 *
 * Sin `frequency`: desde 0045 un hábito no vive suelto, siempre está dentro de
 * una rutina, y es la rutina la que toca cuando toca. Una plantilla de hábito
 * que propusiera una frecuencia estaría proponiendo algo que el formulario ya
 * no tiene dónde guardar.
 */
export interface HabitTemplate {
  id: string;
  name: string;
  category: HabitCategory;
  cue: string;
  twoMinVersion: string;
  why: string;
}

export const HABIT_TEMPLATES: readonly HabitTemplate[] = [
  {
    id: "moverme",
    name: "Moverme 20 minutos",
    category: "Salud",
    cue: "Después de dejar el teléfono cargando por la mañana",
    twoMinVersion: "Ponerme los tenis",
    why: "La versión de dos minutos no es el ejercicio: es el gesto que hace probable el ejercicio."
  },
  {
    id: "agua",
    name: "Un vaso de agua al despertar",
    category: "Salud",
    cue: "Después de apagar la alarma",
    twoMinVersion: "Dejar el vaso lleno en el buró la noche anterior",
    why: "Prepararlo la noche antes convierte el hábito en algo que ya está hecho a medias cuando despiertas."
  },
  {
    id: "hora-de-dormir",
    name: "Acostarme a la misma hora",
    category: "Salud",
    cue: "Después de recoger la cocina",
    twoMinVersion: "Poner una alarma de «hora de apagar»",
    why: "Es el hábito del que dependen casi todos los demás: sin sueño, la mañana no existe."
  },
  {
    id: "leer",
    name: "Leer 20 minutos",
    category: "Aprendizaje",
    cue: "Después de meterme a la cama",
    twoMinVersion: "Leer una página",
    why: "Una página al día es ridículamente poco, y por eso se cumple. La cantidad se acomoda sola."
  },
  {
    id: "apuntar-lo-aprendido",
    name: "Apuntar lo que aprendí",
    category: "Aprendizaje",
    cue: "Después de cerrar el libro",
    twoMinVersion: "Escribir una frase",
    why: "Se apila sobre la lectura: el hábito que ya tienes es el disparador del que quieres tener."
  },
  {
    id: "tres-tareas",
    name: "Definir las 3 tareas del día",
    category: "Trabajo",
    cue: "Después de abrir la computadora",
    twoMinVersion: "Escribir la primera",
    why: "Se ancla a algo que ya haces sin falta, así que no necesita fuerza de voluntad para arrancar."
  },
  {
    id: "cierre-del-dia",
    name: "Cerrar el día en la bitácora",
    category: "Trabajo",
    cue: "Después de la última reunión",
    twoMinVersion: "Una línea de qué pasó",
    why: "Un cierre corto y diario vale más que una revisión larga que se pospone toda la semana."
  },
  {
    id: "gratitud",
    name: "Diario de gratitud",
    category: "Personal",
    cue: "Después de lavarme los dientes en la noche",
    twoMinVersion: "Escribir una sola cosa",
    why: "El cepillado ya es automático: es de los disparadores más fiables que tiene cualquiera."
  },
  {
    id: "meditar",
    name: "Meditar",
    category: "Personal",
    cue: "Después de sentarme en el escritorio",
    twoMinVersion: "Tres respiraciones lentas",
    why: "Tres respiraciones no cambian nada por sí solas; cambian que mañana vuelvas a sentarte."
  },
  {
    id: "llamar",
    name: "Llamar a alguien que quiero",
    category: "Personal",
    cue: "Después de comer el domingo",
    twoMinVersion: "Mandar un mensaje",
    why: "El mensaje es la salida honrosa para el día en que no hay energía para una llamada."
  }
];

export function getHabitTemplate(id: string): HabitTemplate | undefined {
  return HABIT_TEMPLATES.find((t) => t.id === id);
}

/** Las plantillas agrupadas por categoría, en el orden en que se muestran. */
export const HABIT_CATEGORY_ORDER: readonly HabitCategory[] = ["Salud", "Aprendizaje", "Trabajo", "Personal", "Otros"];

export function habitTemplatesByCategory(): { category: HabitCategory; templates: HabitTemplate[] }[] {
  return HABIT_CATEGORY_ORDER.map((category) => ({
    category,
    templates: HABIT_TEMPLATES.filter((t) => t.category === category)
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
