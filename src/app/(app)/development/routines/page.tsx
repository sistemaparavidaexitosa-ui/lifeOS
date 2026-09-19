import { Suspense } from "react";
import { redirect } from "next/navigation";
import InsightSection from "@/components/InsightSection";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Progress, Stat } from "@/components/ui";
import { loadRoutinesForToday, type RutinaDeHoy } from "@/lib/data/routines";
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
import { loadRitualGate } from "@/lib/data/ritual";
import { publicEnv } from "@/config/env";
import RepetirArranque from "@/components/ritual/RepetirArranque";

/**
 * Las Server Actions heredan el `maxDuration` del segmento de ruta desde el que
 * se invocan, y generar el brief es la más lenta del producto: puede esperar
 * hasta veinte segundos al agente y, si este no contesta, gastar diez más en el
 * respaldo. Con el valor por defecto de Vercel (quince segundos) ese peor caso
 * se cortaría justo cuando el respaldo está haciendo su trabajo — es decir,
 * fallaría precisamente el día en que el respaldo existe para salvar.
 */
export const maxDuration = 60;

export default async function RoutinesPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Las consultas y el cálculo de rachas viven en `src/lib/data/routines.ts`
  // desde D-165: el arranque guiado necesita saber qué hábito toca ahora, y
  // copiar seis consultas a un segundo archivo habría acabado con el ritual
  // diciendo que un hábito está pendiente mientras esta pantalla lo da por
  // hecho. Lo que se pinta —incluido el botón de edición de cada fila— sigue
  // siendo de aquí.
  const { today, desdeDetalle, rows, occupations, habitOptions, periodos, diasSolidos } = await loadRoutinesForToday();

  const [identidad, brief, { data: checkin }, puertaRitual] = await Promise.all([
    loadIdentityOverview(),
    loadTodayBrief(),
    supabase.from("daily_reflections").select("*").eq("local_date", today).maybeSingle(),
    loadRitualGate()
  ]);
  const traitNames = Object.fromEntries((identidad?.traits ?? []).map((t) => [t.id, t.name]));
  const traitOptions = (identidad?.traits ?? []).filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, area: t.area }));

  const occOptions: OccupationLite[] = occupations.map((o) => ({
    id: o.id,
    title: o.title,
    start: o.start_time.slice(0, 5),
    end: o.end_time.slice(0, 5)
  }));

  const hoy = rows.filter((r) => r.due && r.routine.active);
  const otras = rows.filter((r) => !r.due || !r.routine.active);

  function renderRoutine(row: RutinaDeHoy, dimmed: boolean) {
    const { routine, occ, progress, fits, adherence, habits: own } = row;

    // El botón de edición se arma AQUÍ y no en la capa de datos: es JSX, y la
    // capa de datos tiene que poder servir también al overlay del ritual, que
    // no pinta ninguno de estos formularios.
    const runnerHabits = own.map<RunnerHabit>((h) => ({
      id: h.id,
      name: h.name,
      category: h.category,
      meal: h.meal,
      durationMin: h.durationMin,
      cue: h.cue,
      twoMinVersion: h.twoMinVersion,
      stackAfterName: h.stackAfterName,
      todayEntry: h.todayEntry,
      weekDoneElsewhere: h.weekDoneElsewhere,
      streak: h.streak,
      streakUnit: h.streakUnit,
      recent: h.recent,
      action: (
        <HabitForm
          routineId={routine.id}
          position={h.position}
          otherHabits={habitOptions}
          traits={traitOptions}
          traitIds={identidad?.votesByHabit[h.id] ?? []}
          habit={{
            id: h.id,
            name: h.name,
            category: h.category,
            meal: h.meal,
            durationMin: h.durationMin,
            cue: h.cue,
            twoMinVersion: h.twoMinVersion,
            stackAfterHabitId: h.stackAfterHabitId
          }}
        />
      )
    }));

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
                  occupationId: routine.occupationId,
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold">Rutinas de hoy</h3>
        {/* La salida del coste aceptado en D-165: la marca de «ya se mostró» se
            escribe al montar, y abrir y cerrar la pestaña consume el arranque.
            Solo aparece si el arranque está encendido para esta persona. */}
        {puertaRitual?.settings.enabled && (
          <div className="flex items-center gap-2 flex-wrap">
            <RepetirArranque
              currency={publicEnv.NEXT_PUBLIC_DEFAULT_CURRENCY}
              locale={publicEnv.NEXT_PUBLIC_DEFAULT_LOCALE}
            />
          </div>
        )}
      </div>

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
                routines={rows.map((r) => ({
                  id: r.routine.id,
                  name: r.routine.name,
                  habitCount: r.habits.length
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
