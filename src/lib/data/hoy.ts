// src/lib/data/hoy.ts
// Lo que Home necesita para «Hoy» (rediseño): la carga del día, las rutinas
// que tocan hoy y lo que vence. SERVIDOR. No calcula: lee y le pasa a los
// mismos cálculos del dominio que usan /time (`cargaDelDia`) y Desarrollo
// (`routineDueToday`, `routineProgress`), para que ninguna pantalla discrepe.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { occupationAppliesOn } from "@/lib/domain/time.ts";
import { cargaDelDia, type CargaDelDia } from "@/lib/domain/tiempo/carga.ts";
import { routineDueToday, routineProgress, type Frequency } from "@/lib/domain/development/routines.ts";

export interface RutinaDeHoy {
  id: string;
  nombre: string;
  hechos: number;
  total: number;
  pct: number;
}

export interface TareaQueVence {
  id: string;
  titulo: string;
  due: string;
  vencida: boolean;
  proyecto: string | null;
  projectId: string | null;
}

export interface Hoy {
  carga: CargaDelDia;
  rutinas: RutinaDeHoy[];
  vencen: TareaQueVence[];
}

const ABIERTAS = ["Pending", "InProgress", "Blocked", "Rescheduled"];

export async function loadHoy(userId: string, hoy: string): Promise<Hoy> {
  const supabase = await createClient();
  const [{ data: perfil }, { data: occs }, { data: tareas }, { data: rutinas }, { data: habitos }, { data: logs }, { data: proyectos }] = await Promise.all([
    supabase.from("profiles").select("activity_window_start, activity_window_end").eq("user_id", userId).single(),
    supabase.from("occupations").select("start_time, end_time, recurring, occ_date, days").eq("user_id", userId),
    supabase.from("tasks").select("id, title, est, status, impact, due, project_id").in("status", ABIERTAS),
    supabase.from("routines").select("id, name, frequency, active, occupation_id").order("position"),
    supabase.from("habits").select("id, routine_id, duration_min"),
    supabase.from("habit_logs").select("habit_id").eq("log_date", hoy).eq("status", "completed"),
    supabase.from("projects").select("id, title")
  ]);

  const ventana = { start: (perfil?.activity_window_start ?? "05:00").slice(0, 5), end: (perfil?.activity_window_end ?? "21:00").slice(0, 5) };
  const ocupaciones = (occs ?? [])
    .filter((o) => occupationAppliesOn({ recurring: o.recurring, occDate: o.occ_date ?? null, days: o.days }, hoy))
    .map((o) => ({ start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5) }));

  const minutos = new Map<string, number>();
  for (const h of habitos ?? []) if (h.routine_id) minutos.set(h.routine_id, (minutos.get(h.routine_id) ?? 0) + (h.duration_min ?? 0));

  const carga = cargaDelDia({
    hoy,
    ventana,
    ocupaciones,
    tareas: (tareas ?? []).map((t) => ({ est: t.est, due: t.due, impact: Boolean(t.impact), status: t.status })),
    rutinas: (rutinas ?? []).map((r) => ({
      frequency: r.frequency as Frequency,
      active: r.active !== false,
      ligadaAOcupacion: Boolean(r.occupation_id),
      minutos: minutos.get(r.id) ?? 0
    }))
  });

  const hechos = (logs ?? []).map((l) => l.habit_id);
  const rutinasDeHoy = (rutinas ?? [])
    .filter((r) => r.active !== false && routineDueToday(r.frequency as Frequency, hoy))
    .map((r) => {
      const propios = (habitos ?? []).filter((h) => h.routine_id === r.id).map((h) => ({ id: h.id, durationMin: h.duration_min ?? 0 }));
      const p = routineProgress(hechos, propios);
      return { id: r.id, nombre: r.name, hechos: p.done, total: p.total, pct: p.pct };
    })
    .filter((r) => r.total > 0);

  const tituloDe = new Map((proyectos ?? []).map((p) => [p.id, p.title]));
  const vencen = (tareas ?? [])
    .filter((t) => t.due && t.due <= hoy)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1))
    .slice(0, 6)
    .map((t) => ({ id: t.id, titulo: t.title, due: t.due!, vencida: t.due! < hoy, proyecto: tituloDe.get(t.project_id) ?? null, projectId: t.project_id }));

  return { carga, rutinas: rutinasDeHoy, vencen };
}
