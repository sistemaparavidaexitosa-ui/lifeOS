// src/lib/data/development.ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { todayLocal, addDaysISO } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import type { SourceSnapshot } from "@/lib/domain/development/goals.ts";

/**
 * Valor actual de cada fuente que puede alimentar un resultado clave.
 * Envuelto en React `cache()` como getUserTimeZone(): /development y
 * /development/goals lo piden dentro del mismo request.
 *
 * PRIVACIDAD (BR-012): los proyectos se filtran a `workspace_id is null`. Un
 * resultado clave solo puede medirse contra un proyecto PERSONAL — si no, el
 * avance de un equipo se filtraría a un módulo declarado privado.
 */
export const loadSourceSnapshot = cache(async (): Promise<SourceSnapshot> => {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { habitCompletionPct: {}, projectDonePct: {}, bookPagesRead: {}, financialGoalAmount: {} };

  const today = todayLocal(await getUserTimeZone());
  const from = addDaysISO(today, -29); // ventana de 30 días para hábitos

  const [{ data: habits }, { data: logs }, { data: projects }, { data: books }, { data: fgoals }] = await Promise.all([
    supabase.from("habits").select("id"),
    supabase.from("habit_logs").select("habit_id, log_date").gte("log_date", from).lte("log_date", today),
    supabase.from("projects").select("id").is("workspace_id", null),
    supabase.from("books").select("id, current_page"),
    supabase.from("financial_goals").select("id, current_amount")
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

  return { habitCompletionPct, projectDonePct, bookPagesRead, financialGoalAmount };
});
