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
import { CardHeader, ModuleNote, SectionHeader } from "../FormSheet";
import RoutineForm, { StepForm, type OccupationLite } from "./RoutineForm";
import RoutineTemplates from "./RoutineTemplates";
import RoutineRunner, { type RunnerStep } from "./RoutineRunner";
import { getSessionUser } from "@/lib/data/session";

export default async function RoutinesPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
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
      // El botón de editar viaja DENTRO de cada paso. Antes todos los "Editar
      // paso" se acumulaban en una fila al pie de la tarjeta: seis pasos daban
      // seis botones idénticos, sin decir cuál era cuál, y en móvil ocupaban
      // más alto que la propia rutina.
      runnerSteps: own.map<RunnerStep>((s) => ({
        id: s.id,
        title: s.title,
        durationMin: s.duration_min,
        habitName: s.habit_id ? habitById.get(s.habit_id) ?? null : null,
        action: (
          <StepForm
            routineId={r.id}
            step={{ id: s.id, title: s.title, durationMin: s.duration_min, habitId: s.habit_id, position: s.position }}
            position={s.position}
            habits={habitOptions}
          />
        )
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
                  active: routine.active
                }}
                occupations={occOptions}
              />
            }
          />
        </div>

        <div className="mt-2.5">
          <div className="flex justify-between gap-2 text-xs mb-1" style={{ color: "var(--muted)" }}>
            <span>
              {progress.done} de {progress.total} pasos
            </span>
            <span className="flex-shrink-0">{progress.remainingMin} min por delante</span>
          </div>
          <Progress pct={progress.pct} kind={!fits ? "warn" : undefined} />
        </div>

        {row.due && routine.active ? (
          <RoutineRunner routineId={routine.id} steps={runnerSteps} completedStepIds={completedStepIds} today={today} />
        ) : (
          <div className="mt-2.5 flex flex-col">
            {own.map((s) => (
              <div key={s.id} className="flex items-start gap-2 py-1.5" style={{ borderTop: "1px solid var(--line)" }}>
                <span className="grow min-w-0 text-sm" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
                  {s.title} · {s.duration_min} min
                </span>
                <span className="flex-shrink-0">
                  <StepForm
                    routineId={routine.id}
                    step={{ id: s.id, title: s.title, durationMin: s.duration_min, habitId: s.habit_id, position: s.position }}
                    position={s.position}
                    habits={habitOptions}
                  />
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2.5">
          <StepForm routineId={routine.id} position={own.length} habits={habitOptions} block />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <ModuleNote>
        Una rutina solo aporta el orden de sus pasos: el bloque horario sigue viviendo en Autogestión del Tiempo y la racha
        sigue viviendo en Hábitos. Completar un paso ligado a un hábito lo marca allá, sin duplicarlo.
      </ModuleNote>

      <SectionHeader
        action={
          <span className="flex gap-2">
            <RoutineTemplates occupations={occOptions} />
            <RoutineForm occupations={occOptions} />
          </span>
        }
      >
        Rutinas de hoy
      </SectionHeader>

      {!rows.length && (
        <Card>
          <EmptyState icon="🔁" text="Crea tu primera rutina, o parte de una plantilla: Mañana Milagrosa (S.A.V.E.R.S.) o el Club de las 5 AM (20/20/20). Ánclala a un bloque de tu Autogestión del Tiempo y sus pasos pueden ser hábitos que ya llevas." />
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
