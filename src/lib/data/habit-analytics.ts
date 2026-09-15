// src/lib/data/habit-analytics.ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUserTimeZone } from "@/lib/data/profile";
import { todayInTimeZone } from "@/lib/domain/datetime.ts";
import type { Frequency } from "@/lib/domain/development/routines.ts";
import { buildHabitSeries, type HabitSeries } from "@/lib/domain/development/habit-analytics.ts";

/**
 * Las series de todos los hábitos del usuario en [from, to], listas para el
 * dominio.
 *
 * El histórico sale de `habit_log_series` y no de un `select` sobre
 * `habit_logs`: `max_rows = 1000` corta en silencio, y un año de diez hábitos
 * ya son 3.650 filas. En arreglos es una fila por hábito (D-162).
 *
 * Aquí no hay aritmética: solo se leen filas y se traduce `created_at` a la
 * fecha LOCAL del usuario, que es la que entiende el dominio. Un hábito creado
 * a las 11 de la noche en México ya es «mañana» en UTC.
 */
export const loadHabitSeries = cache(async (fromISO: string, toISO: string): Promise<HabitSeries[]> => {
  const supabase = await createClient();
  const [timeZone, { data: habits }, { data: routines }, { data: rows }] = await Promise.all([
    getUserTimeZone(),
    supabase.from("habits").select("id, routine_id, created_at").order("position"),
    supabase.from("routines").select("id, frequency"),
    supabase.rpc("habit_log_series", { p_from: fromISO, p_to: toISO })
  ]);

  const frecuencia = new Map((routines ?? []).map((r) => [r.id, r.frequency as Frequency]));

  return buildHabitSeries(
    (habits ?? []).map((h) => ({
      id: h.id,
      frequency: frecuencia.get(h.routine_id) ?? "Diario",
      createdOn: todayInTimeZone(timeZone, new Date(h.created_at))
    })),
    rows ?? []
  );
});
