// src/lib/domain/ai/chat.ts
// El chat de IA transversal — lógica pura, sin React ni Supabase (probada en
// tests/domain/ai-chat.test.ts).
//
// Lo que vive aquí son las dos reglas que no se pueden delegar al modelo: qué
// parte de la conversación se le manda, y qué se acepta de lo que propone.

/** Un turno guardado, en la forma que interesa fuera de la base. */
export interface ChatMessageLike {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** ISO con hora. */
  createdAt: string;
}

/**
 * Cuántos turnos previos viajan al modelo.
 *
 * No es el historial que se PINTA —ese es todo— sino el que se manda. Un chat
 * de meses no cabe en ninguna ventana, y aunque cupiera, cada turno viejo es
 * contexto que compite con los hechos por la atención del modelo. Doce turnos
 * son seis idas y vueltas: suficiente para que «y eso último» siga
 * significando algo.
 */
export const MAX_TURNOS = 12;

/**
 * La ventana que se le manda al modelo, del más antiguo al más reciente.
 *
 * SIEMPRE EMPIEZA EN UN TURNO DE USUARIO, y esa es toda la sutileza. Cortar
 * por el número justo puede dejar arriba una respuesta suelta del asistente:
 * el modelo leería su propia frase como si alguien se la hubiera dicho, y
 * arrancaría contestando a media conversación. Si el corte cae en una
 * respuesta, se descarta y la ventana empieza una línea más abajo.
 */
export function recortarHistorial(mensajes: readonly ChatMessageLike[], max = MAX_TURNOS): ChatMessageLike[] {
  const ventana = max <= 0 ? [] : mensajes.slice(-max);
  const primero = ventana.findIndex((m) => m.role === "user");
  return primero <= 0 ? (primero === 0 ? ventana : []) : ventana.slice(primero);
}

/** Tope de una tarea propuesta. Un título más largo que esto es un párrafo. */
export const MAX_TITULO_TAREA = 120;

/**
 * Detecta una fecha escrita dentro del título. Mismo criterio —y por el mismo
 * motivo— que `sanitizePlan` en domain/execution/ai-plan.ts: una fecha
 * inventada por el modelo deja el tablero lleno de tareas vencidas al mes
 * siguiente. La tarea se crea igual; lo que se quita es la fecha.
 */
const FECHA = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/g;

/**
 * Lo que se acepta de una tarea propuesta por el modelo, o `null` si no hay
 * nada que proponer.
 *
 * Devolver `null` es una respuesta válida y la más frecuente: la mayoría de
 * los turnos son preguntas, no encargos. Un botón «Crear» sobre un título
 * vacío o de dos letras sería peor que no ofrecerlo.
 */
export function sanitizeProposedTask(title: string | null | undefined): string | null {
  if (!title) return null;

  const limpio = title
    .replace(FECHA, "")
    .replace(/\s+/g, " ")
    .trim()
    // Una coma o un guion sueltos al final son lo que queda cuando se quita la
    // fecha de «Aplicar migraciones, 2026-09-04».
    .replace(/[\s,;:·—–-]+$/, "")
    .trim();

  if (limpio.length < 3) return null;
  return limpio.length > MAX_TITULO_TAREA ? `${limpio.slice(0, MAX_TITULO_TAREA - 1).trimEnd()}…` : limpio;
}
