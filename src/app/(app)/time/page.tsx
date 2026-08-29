import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, Stat, EmptyState } from "@/components/ui";
import { availableSlots, saturationStatus, occupationAppliesOn, daysLabel } from "@/lib/domain/time.ts";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import Timeline from "./Timeline";
import ActivityWindowForm from "./ActivityWindowForm";
import OccupationForm from "./OccupationForm";
import AssignSlotButton from "./AssignSlotButton";
import WeekView from "./WeekView";
import { getSessionUser } from "@/lib/data/session";

// ACTUALIZACIÓN — Autogestión del Tiempo soporta ocupaciones y tareas para
// CUALQUIER día de la semana (no solo "hoy"):
//   1. Se lee la nueva columna occ_date de `occupations` (migración
//      0016_time_occupation_date.sql).
//   2. FIX DE BUG real: antes se pasaban TODAS las ocupaciones del usuario
//      (sin filtrar por fecha) tanto al cálculo de espacios/saturación de
//      HOY como a la vista semanal — con occ_date ahora existiendo, hay
//      que filtrar explícitamente cuáles aplican a "hoy" (recurring=true O
//      occ_date=hoy) para no mostrar/computar ocupaciones de otros días.
//   3. La vista semanal (WeekView) ahora recibe TODAS las ocupaciones (sin
//      filtrar) para poder mostrar, por cada uno de los 7 días, exactamente
//      las que le corresponden — y permite editar cada día directamente
//      (DayEditor.tsx), en vez de ser de solo lectura.
//   4. La vista del día sigue mostrando ÚNICAMENTE el día corriente (sin
//      selector de fecha) — sin cambios en ese comportamiento.
export default async function TimePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const todayISO = todayLocal(await getUserTimeZone());

  const [{ data: profile }, { data: occupations }, { data: tasks }] = await Promise.all([
    supabase.from("profiles").select("activity_window_start, activity_window_end").eq("user_id", user.id).single(),
    supabase.from("occupations").select("*").eq("user_id", user.id),
    supabase.from("tasks").select("id, title, est, status, impact, due")
  ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  const windowStart = profile.activity_window_start.slice(0, 5);
  const windowEnd = profile.activity_window_end.slice(0, 5);

  // Todas las ocupaciones del usuario, normalizadas — se le pasan completas
  // a WeekView (que filtra por día internamente) y se filtran aquí mismo
  // para el cálculo del día actual.
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

  // Solo las ocupaciones que aplican HOY cuentan para el rango, la saturación
  // y la línea de tiempo del DÍA ACTUAL. Una recurrente de lunes a viernes no
  // debe saturar el sábado.
  const todayOccs = allOccs.filter((o) => occupationAppliesOn({ recurring: o.recurring, occDate: o.date, days: o.days }, todayISO));

  const slots = availableSlots({ start: windowStart, end: windowEnd }, todayOccs);
  const impactMinutes = (tasks ?? [])
    .filter((t) => t.impact && t.status !== "Completed" && t.status !== "Cancelled")
    .reduce((s, t) => s + (t.est ?? 0), 0);
  const sat = saturationStatus({ start: windowStart, end: windowEnd }, todayOccs, impactMinutes);

  const pendingTasks = (tasks ?? [])
    .filter((t) => t.status === "Pending" || t.status === "InProgress")
    .map((t) => ({ id: t.id, title: t.title, est: t.est ?? 30 }));

  // Tareas con vencimiento (due) en cualquier fecha — usadas por la vista
  // semanal para mostrar "Tareas asignadas a {día}" en DayEditor.
  const dueTasks = (tasks ?? [])
    .filter((t) => !!t.due)
    .map((t) => ({ id: t.id, title: t.title, est: t.est ?? 30, status: t.status, due: t.due as string }));

  const isWeek = view === "week";
  const satKind = sat.status === "saturated" ? "bad" : sat.status === "warn" ? "warn" : "info";

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Define tus ocupaciones y tu rango de actividad diario para identificar espacios disponibles. La IA
        transversal solo advierte o sugiere; nunca reprograma nada sin tu confirmación (BR-018). Puedes agregar y
        editar ocupaciones y tareas de cualquier día de la semana desde la vista semanal.
      </p>

      <div className="row" style={{ display: "flex", gap: 8 }}>
        <Link href="/time" className={!isWeek ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
          Vista del día
        </Link>
        <Link href="/time?view=week" className={isWeek ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
          Vista semanal (7 días)
        </Link>
      </div>

      {isWeek ? (
        <WeekView
          windowStart={windowStart}
          windowEnd={windowEnd}
          occupations={allOccs}
          todayISO={todayISO}
          pendingTasks={pendingTasks}
          dueTasks={dueTasks}
        />
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between" }}>
              <b>
                Capacidad del día · rango {windowStart}–{windowEnd}
              </b>
              <Chip kind={satKind}>{Math.round((sat.capMinutes / 60) * 10) / 10} h</Chip>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
              <Stat label="Comprometido" value={`${Math.round((sat.totalCommitted / 60) * 10) / 10} h (${sat.pct}%)`} />
              <Stat label="Disponible" value={`${Math.round((sat.availableMinutes / 60) * 10) / 10} h`} />
            </div>
            <div className="text-xs" style={{ color: "var(--muted)", marginTop: 8 }}>
              {sat.status === "saturated"
                ? "⚠ Tu día está saturado según ocupaciones + tareas de impacto."
                : sat.status === "warn"
                  ? "Tu día se está llenando."
                  : "Tienes margen disponible hoy."}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between" }}>
              <b>Rango de actividad</b>
              <ActivityWindowForm start={windowStart} end={windowEnd} />
            </div>
            <div className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
              Por defecto 05:00–21:00. Determina dónde se calculan tus espacios disponibles (BR-017).
            </div>
          </Card>

          <Card>
            <b>Línea de tiempo del día</b>
            <Timeline windowStart={windowStart} windowEnd={windowEnd} occupations={todayOccs} slots={slots} />
          </Card>

          <Card>
            <b>Espacios disponibles</b>
            {!slots.length && <EmptyState icon="⏳" text="No hay espacios libres hoy." />}
            {slots.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between"
                style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}
              >
                <b className="text-sm">
                  {s.start} – {s.end}
                </b>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {Math.round((s.minutes / 60) * 10) / 10} h disponibles
                </span>
                <AssignSlotButton slotLabel={`${s.start}–${s.end}`} tasks={pendingTasks} date={todayISO} />
              </div>
            ))}
          </Card>

          <Card>
            <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between" }}>
              <b>Tus ocupaciones</b>
              <OccupationForm defaultDate={todayISO} />
            </div>
            {!todayOccs.length && <EmptyState icon="🗓️" text="Sin ocupaciones hoy." />}
            {todayOccs.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between"
                style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}
              >
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

          {sat.status !== "ok" && (
            <Card>
              <div
                style={{
                  background:
                    sat.status === "saturated"
                      ? "color-mix(in srgb, var(--danger) 8%, var(--surface))"
                      : "color-mix(in srgb, var(--warn) 8%, var(--surface))",
                  margin: "-18px",
                  padding: 18,
                  borderRadius: "inherit"
                }}
              >
                <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between" }}>
                  <b>{sat.status === "saturated" ? "Advertencia de saturación" : "Alerta temprana"}</b>
                  <Chip kind={sat.status === "saturated" ? "bad" : "warn"}>{sat.pct}%</Chip>
                </div>
                <div className="text-sm" style={{ marginTop: 6 }}>
                  {sat.status === "saturated"
                    ? `Comprometiste ${Math.round((sat.totalCommitted / 60) * 10) / 10} h de ${Math.round((sat.capMinutes / 60) * 10) / 10} h disponibles.`
                    : `Vas en ${sat.pct}% de tu capacidad del día.`}
                </div>
                <div className="text-xs" style={{ color: "var(--muted)", marginTop: 6 }}>
                  Evidencia: {Math.round((sat.occupiedMinutes / 60) * 10) / 10} h en ocupaciones +{" "}
                  {Math.round((sat.taskMinutes / 60) * 10) / 10} h en tareas de impacto, sobre{" "}
                  {Math.round((sat.capMinutes / 60) * 10) / 10} h de capacidad.
                </div>
                <div className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
                  Sugerencia: prioriza tu Única Cosa en el primer espacio disponible. Recomendación explicable; no se
                  aplica automáticamente (BR-018).
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
