// Cola semanal de lectura — lógica pura, sin React ni Supabase (probada en
// tests/domain/development-reading-plan.test.ts).
//
// QUÉ RESUELVE
// reading.ts mide el PASADO y lo mide bien: en qué página vas, a qué velocidad
// y desde cuándo no avanzas. Lo que faltaba era la intención — qué pensabas
// leer y cuándo. Sin ella, Home elegía el libro a enseñar por `updated_at` más
// reciente, que señala el que tocaste al final y no el que decidiste leer.
//
// La unidad es la SEMANA, no la fecha objetivo ni las páginas al día. Es como
// se piensa la lectura ("este mes me leo dos") y la única que permite decir
// literalmente «el libro de esta semana es X».
//
// LA REGLA QUE GOBIERNA ESTE ARCHIVO
// La misma que la de reading.ts: no se inventa un número. `requiredPace`
// devuelve `null` cuando no hay con qué calcular, porque una cifra inventada se
// lee igual que una calculada y así es como la pantalla pierde su crédito.

import { addDaysISO, diffDays, weekStartISO } from "../datetime.ts";

/** Una fila de `reading_plan_weeks`: este libro, esta semana. */
export interface PlanEntry {
  bookId: string;
  /** Lunes, ISO `YYYY-MM-DD`. La columna lo impone con un check. */
  weekStart: string;
  /** Orden dentro de la semana. El menor es el foco. */
  position: number;
}

export interface PlannedBook {
  id: string;
  status: string;
  currentPage: number;
  totalPages: number;
  /** `books.updated_at`, ISO. Solo se usa para el respaldo sin plan. */
  updatedAt: string;
}

export type PlanState = "Esta semana" | "Atrasado" | "Programado" | "Sin plan";

/** Por qué este libro es el foco. Viaja hasta la UI: Home cambia su título con esto. */
export type FocusReason = "atrasado" | "esta semana" | "sin plan";

export interface Focus {
  bookId: string;
  reason: FocusReason;
  /** Semana que lo puso ahí. `null` cuando es el respaldo sin plan. */
  weekStart: string | null;
}

export interface RequiredPace {
  pagesPerDay: number;
  daysLeft: number;
  /** Domingo de la última semana programada: el plazo que te pusiste. */
  lastDay: string;
}

/** Máximo tolerado por la UI y por la acción de servidor. Tres meses es plan, no antojo. */
export const MAX_PLAN_WEEKS = 12;

/**
 * Las semanas a insertar a partir de «primera semana + cuántas».
 *
 * El formulario multiplica y la tabla se queda tonta: un libro de tres semanas
 * son tres filas, así que mover o quitar una semana es tocar una fila y «los
 * libros de esta semana» es un `where week_start = ?` sin aritmética.
 *
 * Normaliza al lunes aunque le entre un miércoles — la columna no acepta otra
 * cosa, y es mejor corregirlo aquí que rechazar el formulario.
 */
export function planWeeks(firstWeekISO: string, count: number): string[] {
  if (count <= 0) return [];
  const primera = weekStartISO(firstWeekISO);
  return Array.from({ length: Math.min(count, MAX_PLAN_WEEKS) }, (_, i) => addDaysISO(primera, i * 7));
}

/** Primera y última semana programadas de un libro. `null` si no tiene plan. */
function extremos(entries: PlanEntry[]): { primera: string; ultima: string } | null {
  if (!entries.length) return null;
  const semanas = entries.map((e) => e.weekStart).sort((a, b) => a.localeCompare(b));
  const primera = semanas[0];
  const ultima = semanas[semanas.length - 1];
  if (!primera || !ultima) return null;
  return { primera, ultima };
}

/**
 * Estado del plan de UN libro (recibe solo sus entradas).
 *
 * "Atrasado" lo decide la ÚLTIMA semana programada, no la primera. Un plan de
 * tres semanas que arrancó la semana pasada y llega hasta la que viene va en
 * hora; marcarlo como atrasado por haber empezado antes convertiría el aviso
 * en ruido, y un aviso que salta siempre deja de leerse.
 */
export function planStatus(entries: PlanEntry[], book: { status: string }, today: string): PlanState {
  const rango = extremos(entries);
  if (!rango) return "Sin plan";

  const semanaActual = weekStartISO(today);
  if (rango.ultima < semanaActual) {
    // Terminarlo tarde sigue siendo terminarlo: no se persigue a nadie por un
    // libro que ya cerró.
    return book.status === "Terminado" ? "Programado" : "Atrasado";
  }
  if (rango.primera <= semanaActual) return "Esta semana";
  return "Programado";
}

/**
 * El libro «más urgente»: lo que Home y el Panel de Desarrollo enseñan.
 *
 * Una cola por sí sola no mide si vas a tiempo, pero sí sabe algo que ninguna
 * otra cosa sabe: que una semana YA PASÓ. De ahí salen los tres escalones:
 *
 *   1. `atrasado`     — su última semana quedó atrás y sigue sin terminarse.
 *                       Entre varios, el de la semana más vieja.
 *   2. `esta semana`  — programado para la semana en curso, menor `position`.
 *   3. `sin plan`     — respaldo: el libro `Leyendo` con `updated_at` más
 *                       reciente. Es EXACTAMENTE lo que Home hacía antes de
 *                       que existiera la cola, así que mientras esté vacía
 *                       nadie pierde nada y la tarjeta nunca sale en blanco.
 */
export function focusBook(entries: PlanEntry[], books: PlannedBook[], today: string): Focus | null {
  const semanaActual = weekStartISO(today);
  const porId = new Map(books.map((b) => [b.id, b]));

  // Un plan puede apuntar a un libro que ya no está (borrado entre la consulta
  // y esta línea, o filtrado por `Terminado` río arriba): se ignora en vez de
  // devolver un id que la pantalla no sabría pintar.
  const vivas = entries.filter((e) => {
    const libro = porId.get(e.bookId);
    return libro !== undefined && libro.status !== "Terminado";
  });

  const atrasados = agruparPorLibro(vivas)
    .filter((g) => g.ultima < semanaActual)
    .sort((a, b) => a.ultima.localeCompare(b.ultima) || a.bookId.localeCompare(b.bookId));
  const primerAtrasado = atrasados[0];
  if (primerAtrasado) {
    return { bookId: primerAtrasado.bookId, reason: "atrasado", weekStart: primerAtrasado.ultima };
  }

  const deEstaSemana = vivas
    .filter((e) => e.weekStart === semanaActual)
    .sort((a, b) => a.position - b.position || a.bookId.localeCompare(b.bookId));
  const primero = deEstaSemana[0];
  if (primero) return { bookId: primero.bookId, reason: "esta semana", weekStart: primero.weekStart };

  const respaldo = books
    .filter((b) => b.status === "Leyendo")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return respaldo ? { bookId: respaldo.id, reason: "sin plan", weekStart: null } : null;
}

function agruparPorLibro(entries: PlanEntry[]): { bookId: string; ultima: string }[] {
  const ultimaPorLibro = new Map<string, string>();
  for (const e of entries) {
    const previa = ultimaPorLibro.get(e.bookId);
    if (previa === undefined || e.weekStart > previa) ultimaPorLibro.set(e.bookId, e.weekStart);
  }
  return [...ultimaPorLibro].map(([bookId, ultima]) => ({ bookId, ultima }));
}

/**
 * Páginas por día necesarias para terminar dentro de la última semana
 * programada. Es lo que convierte una lista en un plan: leída junto a
 * `readingVelocity()` de reading.ts produce la única frase que importa —
 * «necesitas 22 págs./día, vas a 14».
 *
 * Devuelve `null` sin plan, sin total de páginas, ya terminado o ya pasada la
 * última página. Nunca un número inventado.
 */
export function requiredPace(book: PlannedBook, entries: PlanEntry[], today: string): RequiredPace | null {
  if (book.status === "Terminado") return null;
  if (book.totalPages <= 0) return null;

  const faltan = book.totalPages - book.currentPage;
  if (faltan <= 0) return null;

  const rango = extremos(entries);
  if (!rango) return null;

  // El plazo es el DOMINGO de la última semana, no su lunes: la semana entera
  // cuenta como tiempo para leer.
  const lastDay = addDaysISO(rango.ultima, 6);
  // `+1` porque hoy todavía cuenta. Con el plazo vencido queda 1 —hoy— en vez
  // de un negativo que daría un ritmo con signo al revés.
  const daysLeft = Math.max(1, diffDays(today, lastDay) + 1);

  return {
    pagesPerDay: Math.round((faltan / daysLeft) * 10) / 10,
    daysLeft,
    lastDay
  };
}

/** Texto corto del porqué del foco, para el título de la tarjeta. */
export const FOCUS_TITLE: Record<FocusReason, string> = {
  atrasado: "El libro de esta semana",
  "esta semana": "El libro de esta semana",
  // Sin plan no se promete un plan: se dice lo que de verdad se sabe.
  "sin plan": "Hoy estás leyendo"
};
