import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Progress } from "@/components/ui";
import { todayLocal, addDaysISO } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import {
  routineDueToday,
  routineProgress,
  routineFitsBlock,
  routineAdherence,
  type Frequency
} from "@/lib/domain/development/routines.ts";
import { habitStreak, habitDoneToday } from "@/lib/domain/habits.ts";
import { CardHeader, ModuleNote, SectionHeader } from "../FormSheet";
import RoutineForm, { type OccupationLite } from "./RoutineForm";
import RoutineTemplates from "./RoutineTemplates";
import HabitTemplates from "./HabitTemplates";
import HabitForm from "./HabitForm";
import RoutineRunner, { type RunnerHabit } from "./RoutineRunner";
import { getSessionUser } from "@/lib/data/session";

export default async function RoutinesPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // "Hoy" se calcula ANTES de consultar: la ventana de adherencia depende de él.
  const today = todayLocal(await getUserTimeZone());
  const from = addDaysISO(today, -29);

  const [{ data: routines }, { data: habits }, { data: occupations }, { data: habitLogs }, { data: runs }] =
    await Promise.all([
      supabase.from("routines").select("*").order("position"),
      supabase.from("habits").select("*").order("position"),
      supabase.from("occupations").select("id, title, start_time, end_time"),
      supabase.from("habit_logs").select("habit_id, log_date"),
      supabase.from("routine_runs").select("*").gte("local_date", from).lte("local_date", today)
    ]);

  const occById = new Map((occupations ?? []).map((o) => [o.id, o]));
  const habitById = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const logs = (habitLogs ?? []).map((l) => ({ habitId: l.habit_id, date: l.log_date }));
  const doneToday = new Set(logs.filter((l) => l.date === today).map((l) => l.habitId));

  const occOptions: OccupationLite[] = (occupations ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    start: o.start_time.slice(0, 5),
    end: o.end_time.slice(0, 5)
  }));
  // Candidatos para apilar: todos los hábitos del usuario, de cualquier rutina.
  // El apilamiento puede cruzar rutinas; el orden solo describe el de la propia.
  const habitOptions = (habits ?? []).map((h) => ({ id: h.id, name: h.name }));

  const rows = (routines ?? []).map((r) => {
    const own = (habits ?? []).filter((h) => h.routine_id === r.id);
    const habitLikes = own.map((h) => ({ id: h.id, durationMin: h.duration_min }));
    const occ = r.occupation_id ? occById.get(r.occupation_id) ?? null : null;
    const block = occ ? { start: occ.start_time, end: occ.end_time } : null;
    const completedDates = (runs ?? [])
      .filter((x) => x.routine_id === r.id && x.completed_at !== null)
      .map((x) => x.local_date);
    const doneIds = own.filter((h) => doneToday.has(h.id)).map((h) => h.id);

    return {
      routine: r,
      habits: own,
      runnerHabits: own.map<RunnerHabit>((h) => ({
        id: h.id,
        name: h.name,
        category: h.category,
        durationMin: h.duration_min,
        cue: h.cue,
        twoMinVersion: h.two_min_version,
        stackAfterName: h.stack_after_habit_id ? habitById.get(h.stack_after_habit_id) ?? null : null,
        doneToday: habitDoneToday(h.id, logs, today),
        streak: habitStreak(h.id, logs, today),
        action: (
          <HabitForm
            routineId={r.id}
            position={h.position}
            otherHabits={habitOptions}
            habit={{
              id: h.id,
              name: h.name,
              category: h.category,
              durationMin: h.duration_min,
              cue: h.cue,
              twoMinVersion: h.two_min_version,
              stackAfterHabitId: h.stack_after_habit_id
            }}
          />
        )
      })),
      due: routineDueToday(r.frequency as Frequency, today),
      progress: routineProgress(doneIds, habitLikes),
      fits: routineFitsBlock(habitLikes, block),
      occ,
      adherence: routineAdherence(completedDates, r.frequency as Frequency, from, today)
    };
  });

  const hoy = rows.filter((r) => r.due && r.routine.active);
  const otras = rows.filter((r) => !r.due || !r.routine.active);

  function renderRoutine(row: (typeof rows)[number], dimmed: boolean) {
    const { routine, occ, progress, fits, adherence, runnerHabits, habits: own } = row;
    return (
      <Card key={routine.id}>
        <div style={dimmed ? { opacity: 0.65 } : undefined}>
          <CardHeader
            title={routine.name}
            meta={
              <>
                <Chip kind="info">{routine.frequency}</Chip>
                {!routine.active && <Chip>Inactiva</Chip>}
                {occ && (
                  <Chip kind="purple">
                    {occ.title} {occ.start_time.slice(0, 5)}–{occ.end_time.slice(0, 5)}
                  </Chip>
                )}
                {!fits && <Chip kind="warn">No cabe en el bloque</Chip>}
                <Chip kind={adherence >= 70 ? "ok" : adherence >= 40 ? "warn" : "bad"}>{adherence}% a 30 días</Chip>
              </>
            }
            action={
              <RoutineForm
                routine={{
                  id: routine.id,
                  name: routine.name,
                  frequency: routine.frequency,
                  occupationId: routine.occupation_id,
                  identity: routine.identity,
                  active: routine.active
                }}
                occupations={occOptions}
              />
            }
          />
        </div>

        {/* La identidad preside la rutina y no se esconde en el formulario:
            su trabajo es recordarte por qué la sostienes, y encerrada en la
            pantalla de edición no la lee nadie. */}
        {routine.identity && (
          <p className="ah-why mt-2">{routine.identity}</p>
        )}

        <div className="mt-2.5">
          <div className="flex justify-between gap-2 text-xs mb-1" style={{ color: "var(--muted)" }}>
            <span>
              {progress.done} de {progress.total} hábitos
            </span>
            <span className="flex-shrink-0">{progress.remainingMin} min por delante</span>
          </div>
          <Progress pct={progress.pct} kind={!fits ? "warn" : undefined} />
        </div>

        <RoutineRunner routineId={routine.id} habits={runnerHabits} today={today} />

        <div className="mt-2.5">
          <HabitForm routineId={routine.id} position={own.length} otherHabits={habitOptions} label="+ Hábito" />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <ModuleNote>
        Cada hábito vive dentro de una rutina y toca cuando toca ella. El bloque horario sigue viviendo en Autogestión
        del Tiempo: la rutina se ancla a uno que ya existe. Todo esto es privado, sin relación con Workspaces (BR-027).
      </ModuleNote>

      <SectionHeader
        action={
          <span className="flex gap-2">
            <HabitTemplates
              routines={(routines ?? []).map((r) => ({
                id: r.id,
                name: r.name,
                habitCount: (habits ?? []).filter((h) => h.routine_id === r.id).length
              }))}
              otherHabits={habitOptions}
            />
            <RoutineTemplates occupations={occOptions} />
            <RoutineForm occupations={occOptions} />
          </span>
        }
      >
        Rutinas de hoy
      </SectionHeader>

      {!rows.length && (
        <Card>
          <EmptyState
            icon="🔁"
            text="Crea tu primera rutina, o parte de una plantilla: Mañana Milagrosa (S.A.V.E.R.S.) o el Club de las 5 AM (20/20/20). Ánclala a un bloque de tu Autogestión del Tiempo, y sus hábitos llevarán racha desde el primer día."
          />
        </Card>
      )}

      {rows.length > 0 && !hoy.length && (
        <Card>
          <EmptyState icon="🔁" text="Hoy no toca ninguna rutina." />
        </Card>
      )}

      {hoy.map((r) => renderRoutine(r, false))}

      {otras.length > 0 && (
        <>
          <h3 className="font-bold mt-2">Otras rutinas</h3>
          {otras.map((r) => renderRoutine(r, true))}
        </>
      )}
    </div>
  );
}
