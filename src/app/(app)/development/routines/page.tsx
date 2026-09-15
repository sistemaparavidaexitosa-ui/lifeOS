import { Suspense } from "react";
import { redirect } from "next/navigation";
import InsightSection from "@/components/InsightSection";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Progress, Stat } from "@/components/ui";
import { dailyCurve, periodRates, solidDaysStreak } from "@/lib/domain/development/habit-dashboard.ts";
import { addDaysISO } from "@/lib/data/dates";
import { todayForUser } from "@/lib/data/profile";
import {
  routineDueToday,
  routineProgress,
  routineFitsBlock,
  routineAdherence,
  type Frequency
} from "@/lib/domain/development/routines.ts";
import { habitStreaks, slotStates, type HabitLogEntry } from "@/lib/domain/development/habit-analytics.ts";
import { loadHabitSeries } from "@/lib/data/habit-analytics";
import DailyCheckinCard from "./DailyCheckinCard";
import { loadIdentityOverview, loadTodayBrief } from "@/lib/data/identity";
import BriefCard from "./brief/BriefCard";
import BriefGenerator from "./brief/BriefGenerator";
import IdentityHero from "./identity/IdentityHero";
import IdentityScoreCard from "./identity/IdentityScoreCard";
import { CardHeader, ModuleNote } from "../FormSheet";
import RoutineForm, { type OccupationLite } from "./RoutineForm";
import RoutineTemplates from "./RoutineTemplates";
import { listTemplates } from "@/lib/data/templates";
import HabitTemplates from "./HabitTemplates";
import HabitForm from "./HabitForm";
import RoutineRunner, { type RunnerHabit } from "./RoutineRunner";
import { getSessionUser } from "@/lib/data/session";

export default async function RoutinesPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // "Hoy" se calcula ANTES de consultar: la ventana de adherencia depende de él.
  const today = await todayForUser();
  const from = addDaysISO(today, -29);
  // El histórico llega en arreglos por hábito (`habit_log_series`, 0063): una
  // consulta normal choca con `max_rows = 1000`, que trunca SIN avisar y en un
  // orden que nadie fija. 400 días acotan cualquier racha que esta pantalla
  // sepa dibujar.
  const desdeLogs = addDaysISO(today, -399);
  // La hoja de detalle deja registrar hasta una semana atrás (ver `logHabit`).
  const desdeDetalle = addDaysISO(today, -7);

  const [
    { data: routines },
    { data: habits },
    { data: occupations },
    { data: runs },
    { data: notas },
    { data: checkin },
    series
  ] = await Promise.all([
    supabase.from("routines").select("*").order("position"),
    supabase.from("habits").select("*").order("position"),
    supabase.from("occupations").select("id, title, start_time, end_time"),
    supabase.from("routine_runs").select("*").gte("local_date", from).lte("local_date", today),
    // Las notas no viajan en la serie: solo hacen falta las de la última semana.
    supabase.from("habit_logs").select("habit_id, log_date, note").gte("log_date", desdeDetalle).neq("note", ""),
    supabase.from("daily_reflections").select("*").eq("local_date", today).maybeSingle(),
    loadHabitSeries(desdeLogs, today)
  ]);
  const [identidad, brief] = await Promise.all([loadIdentityOverview(), loadTodayBrief()]);
  const traitNames = Object.fromEntries((identidad?.traits ?? []).map((t) => [t.id, t.name]));
  const traitOptions = (identidad?.traits ?? []).filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, area: t.area }));

  const occById = new Map((occupations ?? []).map((o) => [o.id, o]));
  const habitById = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const seriePorHabito = new Map(series.map((s) => [s.habitId, s]));
  const notaPorDia = new Map((notas ?? []).map((n) => [`${n.habit_id}:${n.log_date}`, n.note]));

  /** Lo que la fila necesita de la serie: el registro de hoy, la semana y la racha. */
  function estadoDe(habitId: string) {
    const s = seriePorHabito.get(habitId);
    if (!s) {
      return { todayEntry: null, weekDoneElsewhere: false, streak: { current: 0, unit: "día" as const }, recent: [] };
    }
    const recent: HabitLogEntry[] = s.logs
      .filter((l) => l.date >= desdeDetalle)
      .map((l) => ({ ...l, note: notaPorDia.get(`${habitId}:${l.date}`) ?? "" }));
    const todayEntry = recent.find((l) => l.date === today) ?? null;
    const ranuraActual = slotStates(s, today, today, today)[0];
    return {
      todayEntry,
      weekDoneElsewhere: s.frequency === "Semanal" && ranuraActual?.state === "completed",
      streak: habitStreaks(s, today, desdeLogs),
      recent
    };
  }
  const estados = new Map((habits ?? []).map((h) => [h.id, estadoDe(h.id)]));
  const doneToday = new Set(
    (habits ?? []).filter((h) => estados.get(h.id)?.todayEntry?.status === "completed").map((h) => h.id)
  );

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
      runnerHabits: own.map<RunnerHabit>((h) => {
        const estado = estados.get(h.id) ?? estadoDe(h.id);
        return {
        id: h.id,
        name: h.name,
        category: h.category,
        meal: h.meal,
        durationMin: h.duration_min,
        cue: h.cue,
        twoMinVersion: h.two_min_version,
        stackAfterName: h.stack_after_habit_id ? habitById.get(h.stack_after_habit_id) ?? null : null,
        todayEntry: estado.todayEntry,
        weekDoneElsewhere: estado.weekDoneElsewhere,
        streak: estado.streak.current,
        streakUnit: estado.streak.unit,
        recent: estado.recent,
        action: (
          <HabitForm
            routineId={r.id}
            position={h.position}
            otherHabits={habitOptions}
            traits={traitOptions}
            traitIds={identidad?.votesByHabit[h.id] ?? []}
            habit={{
              id: h.id,
              name: h.name,
              category: h.category,
              meal: h.meal,
              durationMin: h.duration_min,
              cue: h.cue,
              twoMinVersion: h.two_min_version,
              stackAfterHabitId: h.stack_after_habit_id
            }}
          />
        )
        };
      }),
      due: routineDueToday(r.frequency as Frequency, today),
      progress: routineProgress(doneIds, habitLikes),
      fits: routineFitsBlock(habitLikes, block),
      occ,
      adherence: routineAdherence(completedDates, r.frequency as Frequency, from, today)
    };
  });

  const hoy = rows.filter((r) => r.due && r.routine.active);
  const otras = rows.filter((r) => !r.due || !r.routine.active);

  // Las tres cifras del día salen de las mismas funciones que Analítica: si
  // aquí dice 80 % y allí 78 %, el fallo estaría en un solo sitio.
  const periodos = periodRates(series, today);
  const diasSolidos = solidDaysStreak(dailyCurve(series, addDaysISO(today, -120), today, today), today);

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
                habitCount={own.length}
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

        <RoutineRunner routineId={routine.id} habits={runnerHabits} today={today} minDate={desdeDetalle} />

        <div className="mt-2.5">
          <HabitForm routineId={routine.id} position={own.length} otherHabits={habitOptions} traits={traitOptions} label="+ Hábito" />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {identidad && (
        <div className="grid gap-3.5 md:grid-cols-2 items-start">
          <IdentityHero overview={identidad} />
          <IdentityScoreCard score={identidad.score} delta7={identidad.delta7} />
        </div>
      )}

      {/* El brief solo se pide con una identidad escrita: sin ella no hay de
          qué escribir, y la tarjeta de arriba ya invita a definirla. */}
      {identidad?.profile &&
        (brief ? <BriefCard initial={brief} traitNames={traitNames} /> : <BriefGenerator traitNames={traitNames} />)}

      {rows.length > 0 && (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <Stat label="Hoy" value={periodos.day === null ? "—" : `${periodos.day}%`} />
          <Stat label="Días sólidos" value={diasSolidos} />
          <Stat label="Esta semana" value={periodos.week === null ? "—" : `${periodos.week}%`} />
        </div>
      )}

      <h3 className="font-bold">Rutinas de hoy</h3>

      {!rows.length && (
        <Card>
          <EmptyState
            icon="🔁"
            text="Crea tu primera rutina, o parte de una plantilla: Mañana Milagrosa (S.A.V.E.R.S.) o el Club de las 5 AM (20/20/20). Ánclala a un bloque de tu Autogestión del Tiempo, y sus hábitos llevarán racha desde el primer día."
          />
          {/* Los botones van aquí y no solo en «Tus rutinas»: sin rutinas, esta
              tarjeta es lo único que la persona tiene delante. */}
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            <RoutineTemplates occupations={occOptions} templates={await listTemplates("routine")} />
            <RoutineForm occupations={occOptions} />
          </div>
        </Card>
      )}

      {rows.length > 0 && !hoy.length && (
        <Card>
          <EmptyState icon="🔁" text="Hoy no toca ninguna rutina." />
        </Card>
      )}

      {hoy.map((r) => renderRoutine(r, false))}

      {rows.length > 0 && (
        <DailyCheckinCard
          prompt={brief?.reflectionQuestion ?? "¿Qué hiciste hoy que la persona que quieres ser también habría hecho?"}
          initial={
            checkin
              ? {
                  mood: checkin.mood,
                  energy: checkin.energy,
                  sleepHours: checkin.sleep_hours,
                  reflectionPrompt: checkin.reflection_prompt,
                  reflection: checkin.reflection,
                  wins: checkin.wins
                }
              : null
          }
        />
      )}

      {/* Los insights de hábitos: los que deja el análisis de cada noche (F5) y
          los que se piden con el botón. Va en Suspense para que la consulta no
          retrase el resto de Hoy. */}
      {rows.length > 0 && (
        <Suspense fallback={null}>
          <InsightSection scope="habits" />
        </Suspense>
      )}

      {/* Gestionar va al final: se usa al montar el sistema, no cada mañana. La
          cabecera no lleva los botones al lado del título porque en 400px no
          caben tres y el título acababa partido letra a letra. Sin rutinas no
          se pinta: la tarjeta vacía de arriba ya lleva sus botones. */}
      {rows.length > 0 && (
        <section className="flex flex-col gap-3 mt-2" aria-labelledby="gestionar-rutinas">
          <div className="flex flex-col gap-2">
            <h3 id="gestionar-rutinas" className="font-bold">
              Tus rutinas
            </h3>
            <div className="flex flex-wrap gap-2">
              <RoutineForm occupations={occOptions} />
              {/* Las dos plantillas bajan su catálogo desde el servidor (0044):
                  esta página ya es un Server Component y lo tiene en la mano. */}
              <RoutineTemplates occupations={occOptions} templates={await listTemplates("routine")} />
              <HabitTemplates
                routines={(routines ?? []).map((r) => ({
                  id: r.id,
                  name: r.name,
                  habitCount: (habits ?? []).filter((h) => h.routine_id === r.id).length
                }))}
                otherHabits={habitOptions}
                templates={await listTemplates("habit")}
              />
            </div>
          </div>
          <ModuleNote>
            Cada hábito vive dentro de una rutina y toca cuando toca ella. El bloque horario sigue viviendo en Autogestión
            del Tiempo: la rutina se ancla a uno que ya existe. Todo esto es privado, sin relación con Workspaces (BR-027).
          </ModuleNote>
          {otras.length > 0 && (
            <>
              <h4 className="font-semibold text-sm" style={{ color: "var(--muted)" }}>
                Hoy no tocan
              </h4>
              {otras.map((r) => renderRoutine(r, true))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
