import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState } from "@/components/ui";
import { availableSlots, occupationAppliesOn, daysLabel } from "@/lib/domain/time.ts";
import { cargaDelDia, type ParteDeCarga } from "@/lib/domain/tiempo/carga.ts";
import type { Frequency } from "@/lib/domain/development/routines.ts";
import { fdate } from "@/lib/format";
import { todayForUser } from "@/lib/data/profile";
import { getSessionUser } from "@/lib/data/session";
import Timeline from "./Timeline";
import ActivityWindowForm from "./ActivityWindowForm";
import OccupationForm from "./OccupationForm";
import AssignSlotButton from "./AssignSlotButton";
import WeekView from "./WeekView";
import DailyPlanForm from "../planning/DailyPlanForm";
import CloseoutPanel from "../planning/CloseoutPanel";
import WeeklyReviewPanel from "../planning/WeeklyReviewPanel";

// TIEMPO Y PLANEACIÓN (rediseño): /time y /planning eran dos pantallas que
// hablaban del mismo recurso —las horas del día— sin verse. Ahora son una.
//
// LA CARGA MANDA. Arriba, cuánto le piden HOY todas las secciones donde la
// persona asigna tiempo (ocupaciones, tareas de Execution, rutinas de
// Desarrollo) contra su ventana de actividad, con un consejo por reglas. El
// objetivo no es llenar el día: es que no se sature. Debajo, el plan del día
// (la una cosa), el cierre, la línea de tiempo con sus huecos y, en la vista
// de semana, la planeación semanal y sus revisiones.
//
// Las ocupaciones de HOY son las que aplican hoy (recurrentes o con fecha de
// hoy): una recurrente de lunes a viernes no satura el sábado.
const fuenteColor: Record<ParteDeCarga["fuente"], string> = {
  ocupaciones: "var(--c-blue)",
  tareas: "var(--c-purple)",
  rutinas: "var(--c-orange)"
};

const h = (m: number) => {
  const x = Math.round((m / 60) * 10) / 10;
  return `${Number.isInteger(x) ? x : x.toFixed(1)} h`;
};

export default async function TimePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const todayISO = await todayForUser();

  const [{ data: profile }, { data: occupations }, { data: tasks }, { data: routines }, { data: habits }, { data: plan }, { data: projects }, { data: reviews }] =
    await Promise.all([
      supabase.from("profiles").select("activity_window_start, activity_window_end").eq("user_id", user.id).single(),
      supabase.from("occupations").select("*").eq("user_id", user.id),
      supabase.from("tasks").select("id, title, est, status, impact, due, project_id"),
      supabase.from("routines").select("id, frequency, active, occupation_id"),
      supabase.from("habits").select("routine_id, duration_min"),
      supabase.from("daily_plans").select("*").eq("user_id", user.id).eq("local_date", todayISO).maybeSingle(),
      supabase.from("projects").select("id, title").eq("status", "Active"),
      supabase.from("weekly_reviews").select("*").order("created_at", { ascending: false }).limit(6)
    ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  const windowStart = profile.activity_window_start.slice(0, 5);
  const windowEnd = profile.activity_window_end.slice(0, 5);

  const allOccs = (occupations ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    start: o.start_time.slice(0, 5),
    end: o.end_time.slice(0, 5),
    category: o.category,
    recurring: o.recurring,
    date: (o.occ_date ?? null) as string | null,
    days: o.days
  }));
  const todayOccs = allOccs.filter((o) => occupationAppliesOn({ recurring: o.recurring, occDate: o.date, days: o.days }, todayISO));
  const slots = availableSlots({ start: windowStart, end: windowEnd }, todayOccs);

  const minutosPorRutina = new Map<string, number>();
  for (const hb of habits ?? []) {
    if (!hb.routine_id) continue;
    minutosPorRutina.set(hb.routine_id, (minutosPorRutina.get(hb.routine_id) ?? 0) + (hb.duration_min ?? 0));
  }
  const carga = cargaDelDia({
    hoy: todayISO,
    ventana: { start: windowStart, end: windowEnd },
    ocupaciones: todayOccs,
    tareas: (tasks ?? []).map((t) => ({ est: t.est, due: t.due, impact: Boolean(t.impact), status: t.status })),
    rutinas: (routines ?? []).map((r) => ({
      frequency: r.frequency as Frequency,
      active: r.active !== false,
      ligadaAOcupacion: Boolean(r.occupation_id),
      minutos: minutosPorRutina.get(r.id) ?? 0
    }))
  });

  const abiertas = (tasks ?? []).filter((t) => t.status !== "Completed" && t.status !== "Cancelled");
  const pendingTasks = abiertas.filter((t) => t.status === "Pending" || t.status === "InProgress").map((t) => ({ id: t.id, title: t.title, est: t.est ?? 30 }));
  const dueTasks = (tasks ?? []).filter((t) => !!t.due).map((t) => ({ id: t.id, title: t.title, est: t.est ?? 30, status: t.status, due: t.due as string }));
  const impactTasks = (tasks ?? []).filter((t) => t.impact).map((t) => ({ id: t.id, title: t.title, status: t.status }));

  const isWeek = view === "week";
  const estadoChip = carga.estado === "saturado" ? "bad" : carga.estado === "lleno" ? "warn" : "ok";
  const estadoTexto = carga.estado === "saturado" ? "Saturado" : carga.estado === "lleno" ? "Lleno" : "Con margen";

  // Semana: lo comprometido (tareas abiertas) contra la capacidad de 5 días de la ventana.
  const capSemana = (carga.capMin * 5) / 60;
  const comprometidasSemana = abiertas.reduce((s, t) => s + (t.est ?? 0), 0) / 60;
  const blockedCount = abiertas.filter((t) => t.status === "Blocked").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5" aria-label="Vista">
        <Link href="/time" className={!isWeek ? "btn-primary btn-sm" : "btn-ghost btn-sm"} aria-current={!isWeek ? "page" : undefined}>
          Hoy
        </Link>
        <Link href="/time?view=week" className={isWeek ? "btn-primary btn-sm" : "btn-ghost btn-sm"} aria-current={isWeek ? "page" : undefined}>
          Semana
        </Link>
      </div>

      {isWeek ? (
        <>
          <WeekView windowStart={windowStart} windowEnd={windowEnd} occupations={allOccs} todayISO={todayISO} pendingTasks={pendingTasks} dueTasks={dueTasks} />
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold">Planeación semanal</h3>
              <Chip kind={comprometidasSemana > capSemana ? "bad" : "ok"}>{comprometidasSemana > capSemana ? "Sobrecarga" : "En balance"}</Chip>
            </div>
            <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
              {comprometidasSemana.toFixed(1)} h comprometidas en tareas abiertas · capacidad de {capSemana.toFixed(0)} h en 5 días de tu ventana.
            </p>
            <BarraDeCarga partes={[{ color: "var(--c-purple)", pct: (comprometidasSemana / Math.max(capSemana, 1)) * 100 }]} />
            {comprometidasSemana > capSemana && <p className="text-sm mt-2">Tu semana ya no cabe: reprograma, delega o suelta antes de sumar.</p>}
            <div className="mt-3">
              <WeeklyReviewPanel blockedCount={blockedCount} />
            </div>
          </Card>
          <Card>
            <h3 className="font-bold mb-2">Revisiones semanales</h3>
            {!reviews?.length && <EmptyState icon="📋" text="Sin revisiones aún." />}
            {(reviews ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: "1px solid var(--line)" }}>
                <div className="grow">
                  <b className="text-sm">Semana al {fdate(r.review_date)}</b>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {r.completed_count} completadas · {r.progress_pct}% avance
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Carga de hoy · ventana {windowStart}–{windowEnd}
                </div>
                <div className="text-3xl font-semibold" style={{ letterSpacing: "-0.03em" }}>
                  {carga.pct}%
                  <span className="text-base font-normal" style={{ color: "var(--muted)" }}>
                    {" "}
                    · {h(carga.total)} de {h(carga.capMin)}
                  </span>
                </div>
              </div>
              <Chip kind={estadoChip}>{estadoTexto}</Chip>
            </div>
            <div className="mt-3">
              <BarraDeCarga partes={carga.partes.map((p) => ({ color: fuenteColor[p.fuente], pct: carga.capMin ? (p.minutos / carga.capMin) * 100 : 0 }))} margen />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {carga.partes.map((p) => (
                <Link key={p.fuente} href={p.href} className="rounded-xl p-2.5" style={{ background: "var(--surface2)", textDecoration: "none", color: "inherit" }}>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
                    <span className="rounded-full" style={{ width: 7, height: 7, background: fuenteColor[p.fuente] }} />
                    {p.etiqueta}
                  </div>
                  <b className="text-sm">{h(p.minutos)}</b>
                </Link>
              ))}
            </div>
            <p className="text-sm mt-3">{carga.consejo}</p>
          </Card>

          <div className="grid md:grid-cols-2 gap-4 [&>*]:min-w-0">
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="font-bold">Plan del día</h3>
                <Chip kind={plan?.approved ? "ok" : "warn"}>{plan?.approved ? "Aprobado" : "Sin plan"}</Chip>
              </div>
              {plan ? (
                <div className="text-sm mt-2">
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    Tu una cosa
                  </div>
                  <b>{plan.one_thing}</b>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    Tareas de impacto: {plan.task_ids?.length ?? 0}
                  </div>
                </div>
              ) : (
                <p className="text-sm my-2" style={{ color: "var(--muted)" }}>
                  Elige tu una cosa y hasta 3 tareas de impacto. Lo que no quepa en tu carga, no entra.
                </p>
              )}
              <details className="mt-2">
                <summary className="btn-ghost btn-sm" style={{ display: "inline-flex", cursor: "pointer" }}>
                  {plan ? "Editar plan" : "Planear hoy"}
                </summary>
                <div className="mt-3">
                  <DailyPlanForm projects={projects ?? []} tasks={abiertas.map((t) => ({ id: t.id, title: t.title, project_id: t.project_id, est: t.est ?? 30 }))} />
                </div>
              </details>
            </Card>

            <Card>
              <h3 className="font-bold">Cierre del día</h3>
              <p className="text-sm my-2" style={{ color: "var(--muted)" }}>
                Qué completaste, qué se mueve y qué aprendiste.
              </p>
              <CloseoutPanel impactTasks={impactTasks} />
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between">
              <b>Línea de tiempo</b>
              <ActivityWindowForm start={windowStart} end={windowEnd} />
            </div>
            <Timeline windowStart={windowStart} windowEnd={windowEnd} occupations={todayOccs} slots={slots} />
          </Card>

          <Card>
            <b>Espacios disponibles</b>
            {!slots.length && <EmptyState icon="⏳" text="No hay espacios libres hoy." />}
            {slots.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-2" style={{ padding: "8px 0", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                <b className="text-sm">
                  {s.start} – {s.end}
                </b>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {h(s.minutes)}
                </span>
                <AssignSlotButton slotLabel={`${s.start}–${s.end}`} tasks={pendingTasks} date={todayISO} />
              </div>
            ))}
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <b>Ocupaciones de hoy</b>
              <OccupationForm defaultDate={todayISO} />
            </div>
            {!todayOccs.length && <EmptyState icon="🗓️" text="Sin ocupaciones hoy." />}
            {todayOccs.map((o) => (
              <div key={o.id} className="flex items-center justify-between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                <div>
                  <b className="text-sm">{o.title}</b>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {o.start} – {o.end} · {o.category}
                    {o.recurring ? ` · 🔁 ${daysLabel(o.days)}` : ""}
                  </div>
                </div>
                <OccupationForm occupation={o} defaultDate={todayISO} />
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

/** Barra apilada por fuente; con `margen`, la marca del 80 % (el margen para imprevistos). */
function BarraDeCarga({ partes, margen = false }: { partes: { color: string; pct: number }[]; margen?: boolean }) {
  return (
    <div className="relative" style={{ height: 8, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
      <div className="flex h-full">
        {partes.map((p, i) => (
          <div key={i} style={{ width: `${Math.min(100, Math.max(0, p.pct))}%`, background: p.color }} />
        ))}
      </div>
      {margen && <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: "80%", width: 2, background: "var(--bg)" }} />}
    </div>
  );
}
