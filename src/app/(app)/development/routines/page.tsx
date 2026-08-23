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
import RoutineForm, { StepForm, type OccupationLite } from "./RoutineForm";
import RoutineRunner, { type RunnerStep } from "./RoutineRunner";

export default async function RoutinesPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // "Hoy" se calcula ANTES de consultar: la ventana de adherencia depende de él.
  const today = todayLocal(await getUserTimeZone());
  const from = addDaysISO(today, -29);

  const [{ data: routines }, { data: steps }, { data: occupations }, { data: habits }, { data: runs }] = await Promise.all([
    supabase.from("routines").select("*").order("position"),
    supabase.from("routine_steps").select("*").order("position"),
    supabase.from("occupations").select("id, title, start_time, end_time"),
    supabase.from("habits").select("id, name").order("name"),
    supabase.from("routine_runs").select("*").gte("local_date", from).lte("local_date", today)
  ]);

  const occById = new Map((occupations ?? []).map((o) => [o.id, o]));
  const habitById = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const occOptions: OccupationLite[] = (occupations ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    start: o.start_time.slice(0, 5),
    end: o.end_time.slice(0, 5)
  }));
  const habitOptions = (habits ?? []).map((h) => ({ id: h.id, name: h.name }));

  const rows = (routines ?? []).map((r) => {
    const own = (steps ?? []).filter((s) => s.routine_id === r.id);
    const stepLikes = own.map((s) => ({ id: s.id, durationMin: s.duration_min }));
    const run = (runs ?? []).find((x) => x.routine_id === r.id && x.local_date === today) ?? null;
    const occ = r.occupation_id ? occById.get(r.occupation_id) ?? null : null;
    const block = occ ? { start: occ.start_time, end: occ.end_time } : null;
    const completedDates = (runs ?? []).filter((x) => x.routine_id === r.id && x.completed_at !== null).map((x) => x.local_date);

    return {
      routine: r,
      steps: own,
      runnerSteps: own.map<RunnerStep>((s) => ({
        id: s.id,
        title: s.title,
        durationMin: s.duration_min,
        habitName: s.habit_id ? habitById.get(s.habit_id) ?? null : null
      })),
      completedStepIds: run?.completed_step_ids ?? [],
      due: routineDueToday(r.frequency as Frequency, today),
      progress: routineProgress(run?.completed_step_ids ?? [], stepLikes),
      fits: routineFitsBlock(stepLikes, block),
      occ,
      adherence: routineAdherence(completedDates, r.frequency as Frequency, from, today)
    };
  });

  const hoy = rows.filter((r) => r.due && r.routine.active);
  const otras = rows.filter((r) => !r.due || !r.routine.active);

  function renderRoutine(row: (typeof rows)[number], dimmed: boolean) {
    const { routine, occ, progress, fits, adherence, runnerSteps, completedStepIds, steps: own } = row;
    return (
      <Card key={routine.id}>
        <div className="flex items-center gap-2 flex-wrap" style={dimmed ? { opacity: 0.65 } : undefined}>
          <b className="grow">{routine.name}</b>
          <Chip kind="info">{routine.frequency}</Chip>
          {!routine.active && <Chip>Inactiva</Chip>}
          {occ && (
            <Chip kind="purple">
              {occ.title} {occ.start_time.slice(0, 5)}–{occ.end_time.slice(0, 5)}
            </Chip>
          )}
          {!fits && <Chip kind="warn">No cabe en el bloque</Chip>}
          <Chip kind={adherence >= 70 ? "ok" : adherence >= 40 ? "warn" : "bad"}>{adherence}% a 30 días</Chip>
          <RoutineForm
            routine={{
              id: routine.id,
              name: routine.name,
              frequency: routine.frequency,
              occupationId: routine.occupation_id,
              active: routine.active
            }}
            occupations={occOptions}
          />
        </div>

        <div className="mt-2">
          <div className="flex justify-between text-xs mb-1" style={{ color: "var(--muted)" }}>
            <span>
              {progress.done} de {progress.total} pasos
            </span>
            <span>{progress.remainingMin} min por delante</span>
          </div>
          <Progress pct={progress.pct} kind={!fits ? "warn" : undefined} />
        </div>

        {row.due && routine.active ? (
          <RoutineRunner routineId={routine.id} steps={runnerSteps} completedStepIds={completedStepIds} today={today} />
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {own.map((s) => (
              <div key={s.id} className="text-sm" style={{ color: "var(--muted)" }}>
                {s.title} · {s.duration_min} min
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 flex-wrap justify-end">
          {own.map((s) => (
            <StepForm
              key={s.id}
              routineId={routine.id}
              step={{ id: s.id, title: s.title, durationMin: s.duration_min, habitId: s.habit_id, position: s.position }}
              position={s.position}
              habits={habitOptions}
            />
          ))}
          <StepForm routineId={routine.id} position={own.length} habits={habitOptions} />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--c-orange) 9%, var(--surface))", borderLeft: "3px solid var(--c-orange)" }}>
        Una rutina solo aporta el orden de sus pasos: el bloque horario sigue viviendo en Autogestión del Tiempo y la racha
        sigue viviendo en Hábitos. Completar un paso ligado a un hábito lo marca allá, sin duplicarlo.
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Rutinas de hoy</h3>
        <RoutineForm occupations={occOptions} />
      </div>

      {!rows.length && (
        <Card>
          <EmptyState icon="🔁" text="Crea tu primera rutina. Ánclala a un bloque de tu Autogestión del Tiempo y sus pasos pueden ser hábitos que ya llevas." />
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
