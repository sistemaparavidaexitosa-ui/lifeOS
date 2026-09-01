// src/lib/data/development.ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { todayLocal, addDaysISO } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { getPersonalWorkspaceIds } from "@/lib/data/workspaces";
import type { SourceSnapshot } from "@/lib/domain/development/goals.ts";
import {
  focusBook,
  planStatus,
  requiredPace,
  type PlanEntry,
  type PlannedBook,
  type FocusReason,
  type PlanState,
  type RequiredPace
} from "@/lib/domain/development/reading-plan.ts";
import {
  readingVelocity,
  estimatedFinish,
  type ProgressPoint,
  type FinishEstimate
} from "@/lib/domain/development/reading.ts";
import { getSessionUser } from "@/lib/data/session";

/**
 * Valor actual de cada fuente que puede alimentar un resultado clave.
 * Envuelto en React `cache()` como getUserTimeZone(): /development y
 * /development/goals lo piden dentro del mismo request.
 *
 * PRIVACIDAD (BR-012): los proyectos se filtran a los de un WORKSPACE PERSONAL
 * (workspaces.is_personal, migración 0030). Un resultado clave solo puede
 * medirse contra un proyecto personal — si no, el avance de un equipo se
 * filtraría a un módulo declarado privado. Antes el filtro era
 * `workspace_id is null`, que dejó de existir cuando el workspace se volvió
 * obligatorio.
 */
export const loadSourceSnapshot = cache(async (): Promise<SourceSnapshot> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { habitCompletionPct: {}, projectDonePct: {}, bookPagesRead: {}, financialGoalAmount: {}, savingsGoalAmount: {} };

  const today = todayLocal(await getUserTimeZone());
  const from = addDaysISO(today, -29); // ventana de 30 días para hábitos

  const [{ data: habits }, { data: logs }, { data: projects }, { data: books }, { data: fgoals }, { data: sgoals }] = await Promise.all([
    supabase.from("habits").select("id"),
    supabase.from("habit_logs").select("habit_id, log_date").gte("log_date", from).lte("log_date", today),
    // PROYECTO PERSONAL ya no es "sin workspace" (workspace_id es NOT NULL
    // desde 0030): es "en un workspace personal". Sin este cambio la consulta
    // no fallaba — devolvía cero filas, y el avance de los resultados clave
    // ligados a un proyecto se quedaba en 0% sin decir por qué.
    supabase.from("projects").select("id").in("workspace_id", await getPersonalWorkspaceIds()),
    supabase.from("books").select("id, current_page"),
    supabase.from("financial_goals").select("id, current_amount"),
    supabase.from("savings_goals").select("id, current_amount")
  ]);

  const habitCompletionPct: Record<string, number> = {};
  for (const h of habits ?? []) {
    const hits = (logs ?? []).filter((l) => l.habit_id === h.id).length;
    habitCompletionPct[h.id] = Math.round((hits / 30) * 100);
  }

  const projectIds = (projects ?? []).map((p) => p.id);
  const projectDonePct: Record<string, number> = {};
  if (projectIds.length) {
    const { data: tasks } = await supabase.from("tasks").select("project_id, status").in("project_id", projectIds);
    for (const id of projectIds) {
      const own = (tasks ?? []).filter((t) => t.project_id === id);
      const done = own.filter((t) => t.status === "Completed").length;
      projectDonePct[id] = own.length ? Math.round((done / own.length) * 100) : 0;
    }
  }

  const bookPagesRead: Record<string, number> = {};
  for (const b of books ?? []) bookPagesRead[b.id] = b.current_page;

  const financialGoalAmount: Record<string, number> = {};
  for (const g of fgoals ?? []) financialGoalAmount[g.id] = Number(g.current_amount);

  const savingsGoalAmount: Record<string, number> = {};
  for (const g of sgoals ?? []) savingsGoalAmount[g.id] = Number(g.current_amount);

  return { habitCompletionPct, projectDonePct, bookPagesRead, financialGoalAmount, savingsGoalAmount };
});

/**
 * El libro que Home, el Panel de Desarrollo y la Biblioteca deben enseñar, ya
 * resuelto: quién es, por qué, cuánto llevas y a qué ritmo tendrías que ir.
 *
 * UNA SOLA FUENTE, A PROPÓSITO. Las tres pantallas podrían consultar por su
 * cuenta —de hecho Home lo hacía, con su propio `select` a books— pero entonces
 * nada garantiza que coincidan: el Panel diría un libro y Home otro en la misma
 * sesión, y el usuario no tendría manera de saber cuál le miente.
 */
export interface ReadingFocus {
  book: {
    id: string;
    title: string;
    author: string;
    coverUrl: string;
    currentPage: number;
    totalPages: number;
    status: string;
  };
  pct: number;
  /** Por qué es el foco. Home cambia el título de su tarjeta con esto. */
  reason: FocusReason;
  planState: PlanState;
  /** Ritmo que EXIGE el plan. `null` sin plan o sin total de páginas. */
  pace: RequiredPace | null;
  /** Ritmo REAL de los últimos días. 0 cuando no hay historial suficiente. */
  actualPagesPerDay: number;
  estimate: FinishEstimate;
}

/**
 * Envuelta en `cache()` igual que loadSourceSnapshot(): /development la pide
 * una vez para el Stat y otra para la tarjeta dentro del mismo request.
 */
export const loadReadingFocus = cache(async (): Promise<ReadingFocus | null> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const today = todayLocal(await getUserTimeZone());

  // Los terminados no se consultan: no pueden ser el foco y solo engordarían
  // una respuesta que se pide en cada carga de Home.
  const [{ data: books }, { data: plan }, { data: progress }] = await Promise.all([
    supabase.from("books").select("*").neq("status", "Terminado"),
    supabase.from("reading_plan_weeks").select("book_id, week_start, position"),
    supabase.from("book_progress").select("book_id, local_date, page")
  ]);

  const candidatos: PlannedBook[] = (books ?? []).map((b) => ({
    id: b.id,
    status: b.status,
    currentPage: b.current_page,
    totalPages: b.total_pages,
    updatedAt: b.updated_at
  }));
  const entradas: PlanEntry[] = (plan ?? []).map((p) => ({
    bookId: p.book_id,
    weekStart: p.week_start,
    position: p.position
  }));

  const foco = focusBook(entradas, candidatos, today);
  if (!foco) return null;

  const fila = (books ?? []).find((b) => b.id === foco.bookId);
  const elegido = candidatos.find((b) => b.id === foco.bookId);
  if (!fila || !elegido) return null;

  const suyas = entradas.filter((e) => e.bookId === foco.bookId);
  const puntos: ProgressPoint[] = (progress ?? [])
    .filter((p) => p.book_id === foco.bookId)
    .map((p) => ({ date: p.local_date, page: p.page }));

  return {
    book: {
      id: fila.id,
      title: fila.title,
      author: fila.author,
      coverUrl: fila.cover_url,
      currentPage: fila.current_page,
      totalPages: fila.total_pages,
      status: fila.status
    },
    pct: fila.total_pages ? Math.round((fila.current_page / fila.total_pages) * 100) : 0,
    reason: foco.reason,
    planState: planStatus(suyas, elegido, today),
    pace: requiredPace(elegido, suyas, today),
    // Se redondea aquí y no en la pantalla: "14.333333 págs./día" no lo lee
    // nadie, y tres pantallas redondeando por su cuenta acabarían discrepando.
    actualPagesPerDay: Math.round(readingVelocity(puntos) * 10) / 10,
    estimate: estimatedFinish(
      { currentPage: fila.current_page, totalPages: fila.total_pages, status: fila.status, startedAt: fila.started_at },
      puntos,
      today
    )
  };
});
