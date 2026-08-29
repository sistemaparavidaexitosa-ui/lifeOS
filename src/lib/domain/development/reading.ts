// Ritmo de lectura y fecha estimada de término — lógica pura, sin React ni
// Supabase (probada en tests/domain/development-reading.test.ts).
//
// EL PROBLEMA QUE RESUELVE
// `books.current_page` se sobrescribe en cada actualización, así que la app
// sabía en qué página vas pero no a qué velocidad avanzas. Con eso no se puede
// decir cuándo terminarás ni avisarte de que llevas dos semanas sin abrir el
// libro. La tabla `book_progress` (migración 0034) guarda un punto por día y
// este módulo lo convierte en las tres respuestas útiles.
//
// LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO
// Una estimación calculada sobre un solo punto no vale lo mismo que una
// calculada sobre dos semanas, y fingir que sí es peor que no estimar. Por eso
// `estimatedFinish` devuelve SIEMPRE con qué base estimó, y la pantalla lo
// dice. Con `sin datos` no se inventa una fecha.

import { addDaysISO, diffDays } from "../datetime.ts";

export interface ProgressPoint {
  /** Fecha local del punto, ISO `YYYY-MM-DD`. */
  date: string;
  page: number;
}

export interface BookLike {
  currentPage: number;
  totalPages: number;
  status: string;
  /** Fecha en que se empezó, si la hay. Respaldo cuando no hay historial. */
  startedAt: string | null;
}

export type EstimateBasis = "historial" | "desde el inicio" | "sin datos";

export interface FinishEstimate {
  /** ISO `YYYY-MM-DD`, o null cuando no hay con qué estimar. */
  date: string | null;
  basis: EstimateBasis;
  /** Páginas por día usadas para estimar. 0 si no se pudo calcular. */
  pagesPerDay: number;
  /** Días que faltan según esa velocidad. */
  daysLeft: number;
}

/**
 * Páginas por día entre el primer y el último punto de la ventana.
 *
 * Se mide contra los últimos `windowSize` puntos y no contra todo el historial
 * a propósito: si dejaste el libro parado un mes y lo retomaste, un promedio
 * desde el principio tardaría semanas en reflejar que ya volviste a leer.
 *
 * Devuelve 0 —no un número inventado— cuando hay menos de dos puntos o cuando
 * entre ellos no pasó ni un día.
 */
export function readingVelocity(points: ProgressPoint[], windowSize = 7): number {
  const ordenados = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const ventana = ordenados.slice(-windowSize);
  if (ventana.length < 2) return 0;

  const primero = ventana[0];
  const ultimo = ventana[ventana.length - 1];
  if (!primero || !ultimo) return 0;

  const dias = diffDays(primero.date, ultimo.date);
  const paginas = ultimo.page - primero.page;
  if (dias <= 0 || paginas <= 0) return 0;

  return paginas / dias;
}

/**
 * Días desde el último avance registrado. `null` si no hay ningún punto.
 *
 * Es lo que permite decir "llevas 9 días sin avanzar" en vez de dejar el libro
 * en la estantería de «Leyendo» meses, que es como se acumulan los libros que
 * uno cree que está leyendo.
 */
export function stalledDays(points: ProgressPoint[], today: string): number | null {
  if (!points.length) return null;
  const ultimo = [...points].sort((a, b) => a.date.localeCompare(b.date))[points.length - 1];
  if (!ultimo) return null;
  return Math.max(0, diffDays(ultimo.date, today));
}

/**
 * Fecha estimada de término, diciendo siempre sobre qué base.
 *
 * Tres bases, en orden de preferencia:
 *   - `historial`: hay dos o más puntos en `book_progress`. Es la buena.
 *   - `desde el inicio`: no hay historial suficiente, pero sí `started_at` y
 *     páginas leídas. Es el promedio desde el día uno — sirve para arrancar y
 *     va corrigiéndose sola conforme se acumulan puntos.
 *   - `sin datos`: no hay con qué. Devuelve `date: null` y la pantalla no
 *     enseña ninguna fecha, porque una fecha inventada se lee igual que una
 *     calculada.
 */
export function estimatedFinish(book: BookLike, points: ProgressPoint[], today: string): FinishEstimate {
  const sinDatos: FinishEstimate = { date: null, basis: "sin datos", pagesPerDay: 0, daysLeft: 0 };

  // Un libro terminado, o sin total de páginas, no tiene nada que estimar.
  if (book.status === "Terminado") return sinDatos;
  if (book.totalPages <= 0) return sinDatos;

  const faltan = book.totalPages - book.currentPage;
  if (faltan <= 0) return sinDatos;

  const porHistorial = readingVelocity(points);
  if (porHistorial > 0) return proyectar(faltan, porHistorial, today, "historial");

  // Respaldo: promedio desde que se empezó el libro.
  if (book.startedAt && book.currentPage > 0) {
    const dias = diffDays(book.startedAt, today);
    if (dias > 0) {
      const ritmo = book.currentPage / dias;
      if (ritmo > 0) return proyectar(faltan, ritmo, today, "desde el inicio");
    }
  }

  return sinDatos;
}

function proyectar(faltan: number, pagesPerDay: number, today: string, basis: EstimateBasis): FinishEstimate {
  const daysLeft = Math.max(1, Math.ceil(faltan / pagesPerDay));
  return {
    date: addDaysISO(today, daysLeft),
    basis,
    // Se redondea para mostrar: "3.7 páginas al día" es más honesto que "3",
    // pero "3.6666666" no lo lee nadie.
    pagesPerDay: Math.round(pagesPerDay * 10) / 10,
    daysLeft
  };
}

/** Texto corto de la base, para pintarlo junto a la fecha. */
export const BASIS_LABEL: Record<EstimateBasis, string> = {
  historial: "según tu ritmo de los últimos días",
  "desde el inicio": "promedio desde que lo empezaste",
  "sin datos": "sin datos suficientes"
};
