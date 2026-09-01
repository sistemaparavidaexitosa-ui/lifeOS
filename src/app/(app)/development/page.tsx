import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Progress, Stat } from "@/components/ui";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { loadSourceSnapshot, loadReadingFocus } from "@/lib/data/development";
import { keyResultProgress, goalProgress, goalAtRisk } from "@/lib/domain/development/goals.ts";
import { routineDueToday, routineProgress, type Frequency } from "@/lib/domain/development/routines.ts";
import { CardHeader, SectionHeader } from "./FormSheet";
import { BookCover } from "./library/BookForm";
import { getSessionUser } from "@/lib/data/session";
import { fdate } from "@/lib/format";
import InsightSection from "@/components/InsightSection";

/**
 * Panel del módulo. No calcula nada propio: compone lo que ya resuelven
 * goals.ts y routines.ts. Si aquí aparece aritmética nueva, va en el dominio.
 */
export default async function DevelopmentPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const today = todayLocal(await getUserTimeZone());
  const sources = await loadSourceSnapshot();
  // Ya viene resuelto de la capa de datos —quién es el foco, por qué, y a qué
  // ritmo tendría que ir— para no repetir aquí aritmética que vive en el
  // dominio, ni discrepar con lo que Home enseña en la misma sesión.
  const lectura = await loadReadingFocus();

  const [{ data: goals }, { data: krs }, { data: routines }, { data: steps }, { data: runs }] = await Promise.all([
    supabase.from("personal_goals").select("*").eq("status", "Activa").order("created_at"),
    supabase.from("key_results").select("*").order("position"),
    supabase.from("routines").select("*").eq("active", true).order("position"),
    supabase.from("routine_steps").select("*").order("position"),
    supabase.from("routine_runs").select("*").eq("local_date", today)
  ]);

  const goalRows = (goals ?? [])
    .map((g) => {
      const own = (krs ?? []).filter((k) => k.goal_id === g.id);
      const pct = goalProgress(
        own.map((k) =>
          keyResultProgress(
            {
              id: k.id,
              sourceKind: k.source_kind as "habit" | "project" | "book" | "financial_goal" | "manual",
              sourceId: k.source_id,
              target: Number(k.target),
              manualCurrent: Number(k.manual_current)
            },
            sources
          )
        )
      );
      const atRisk = g.horizon !== null && goalAtRisk(g.created_at.slice(0, 10), g.horizon, pct, today);
      return { goal: g, pct, atRisk, krCount: own.length };
    })
    // Las metas en riesgo primero: es lo que hay que ver al abrir el panel.
    .sort((a, b) => Number(b.atRisk) - Number(a.atRisk));

  const routineRows = (routines ?? [])
    .filter((r) => routineDueToday(r.frequency as Frequency, today))
    .map((r) => {
      const own = (steps ?? []).filter((s) => s.routine_id === r.id).map((s) => ({ id: s.id, durationMin: s.duration_min }));
      const run = (runs ?? []).find((x) => x.routine_id === r.id) ?? null;
      return { routine: r, progress: routineProgress(run?.completed_step_ids ?? [], own) };
    });

  const enRiesgo = goalRows.filter((g) => g.atRisk).length;
  const avanceRutinas = routineRows.length
    ? Math.round(routineRows.reduce((sum, r) => sum + r.progress.pct, 0) / routineRows.length)
    : 0;

  // `!lectura` entra en la condición: con un libro en curso el panel YA tiene
  // algo que contar, y mandarte a "define una meta" mientras lees sería
  // esconder el único dato vivo que hay.
  if (!goalRows.length && !routineRows.length && !(routines ?? []).length && !lectura) {
    return (
      <Card>
        <EmptyState icon="🌱" text="Empieza definiendo una meta personal o una rutina." />
        {/* Dos botones y un texto largo no caben en una línea de 360px: se
            apilan y solo se emparejan cuando hay ancho. */}
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-center">
          <Link href="/development/goals" className="btn-primary btn-sm">
            Definir una meta
          </Link>
          <Link href="/development/routines" className="btn-ghost btn-sm">
            Crear una rutina
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* 160px de mínimo caían a UNA columna en pantallas de 320-360px: tres
          tarjetas de ancho completo empujaban todo el panel bajo el pliegue.
          Con 132px caben dos incluso en un iPhone SE. */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 132px), 1fr))" }}>
        <Stat label="Metas activas" value={goalRows.length} />
        <Stat label="Metas en riesgo" value={enRiesgo} kind={enRiesgo > 0 ? "bad" : undefined} />
        <Stat label="Rutinas de hoy" value={`${avanceRutinas}%`} kind={avanceRutinas < 50 ? "warn" : undefined} />
        {/* Con guion cuando no hay libro, no con "0%": cero por ciento es un
            libro que no has empezado, no la ausencia de libro. */}
        <Stat
          label="Lectura"
          value={lectura ? `${lectura.pct}%` : "—"}
          kind={lectura?.planState === "Atrasado" ? "bad" : undefined}
        />
      </div>

      <SectionHeader
        action={
          <Link href="/development/routines" className="btn-ghost btn-sm">
            Ejecutar
          </Link>
        }
      >
        Rutina de hoy
      </SectionHeader>
      {!routineRows.length ? (
        <Card>
          <EmptyState icon="🔁" text="Hoy no toca ninguna rutina." />
        </Card>
      ) : (
        routineRows.map(({ routine, progress }) => (
          <Card key={routine.id}>
            <CardHeader
              title={routine.name}
              meta={
                <>
                  <Chip kind="info">{routine.frequency}</Chip>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {progress.done}/{progress.total} pasos · {progress.remainingMin} min por delante
                  </span>
                </>
              }
            />
            <div className="mt-2.5">
              <Progress pct={progress.pct} />
            </div>
          </Card>
        ))
      )}

      <div className="mt-2">
        <SectionHeader
          action={
            <Link href="/development/library?por=plan" className="btn-ghost btn-sm">
              Ver el plan
            </Link>
          }
        >
          Leyendo ahora
        </SectionHeader>
      </div>
      {!lectura ? (
        <Card>
          <EmptyState icon="📚" text="No tienes ningún libro en curso." />
          <div className="flex justify-center">
            <Link href="/development/library" className="btn-ghost btn-sm">
              Ir a la Biblioteca
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-start gap-3">
            <BookCover url={lectura.book.coverUrl} />
            <div className="grow min-w-0">
              <CardHeader
                title={lectura.book.title}
                meta={
                  <>
                    {/* "Sin plan" no se pinta: es la ausencia de una decisión,
                        no un estado que el usuario tenga que atender. */}
                    {lectura.planState === "Atrasado" && <Chip kind="bad">Atrasado</Chip>}
                    {lectura.planState === "Esta semana" && <Chip kind="info">Esta semana</Chip>}
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {lectura.book.author}
                      {lectura.book.author ? " · " : ""}
                      página {lectura.book.currentPage} de {lectura.book.totalPages}
                    </span>
                  </>
                }
              />
              <div className="mt-2.5">
                <Progress pct={lectura.pct} kind={lectura.planState === "Atrasado" ? "warn" : undefined} />
              </div>
              {lectura.pace && (
                <div className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                  Para acabar el <b>{fdate(lectura.pace.lastDay)}</b> necesitas <b>{lectura.pace.pagesPerDay}</b>{" "}
                  págs./día
                  {/* El ritmo real solo se enseña cuando de verdad se midió.
                      Con 0 págs./día por falta de historial, decir "vas a 0"
                      sería acusar al usuario de un dato que no existe. */}
                  {lectura.actualPagesPerDay > 0 ? `, y vas a ${lectura.actualPagesPerDay}` : ""}.
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="mt-2">
        <SectionHeader
          action={
            <Link href="/development/goals" className="btn-ghost btn-sm">
              Ver todas
            </Link>
          }
        >
          Metas activas
        </SectionHeader>
      </div>
      {!goalRows.length ? (
        <Card>
          <EmptyState icon="🎯" text="Todavía no tienes metas activas." />
        </Card>
      ) : (
        goalRows.map(({ goal, pct, atRisk, krCount }) => (
          <Card key={goal.id}>
            <CardHeader
              title={goal.title}
              meta={
                <>
                  <Chip kind="info">{goal.area}</Chip>
                  {atRisk && <Chip kind="bad">En riesgo</Chip>}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {krCount} resultado{krCount === 1 ? "" : "s"} clave{goal.horizon ? ` · horizonte ${goal.horizon}` : ""}
                  </span>
                </>
              }
            />
            <div className="mt-2.5">
              <Progress pct={pct} kind={atRisk ? "warn" : undefined} />
            </div>
          </Card>
        ))
      )}

      <InsightSection scope="habits" />
    </div>
  );
}
