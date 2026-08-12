import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, Stat, EmptyState } from "@/components/ui";
import { availableSlots, saturationStatus } from "@/lib/domain/time.ts";
import { todayLocal } from "@/lib/data/dates";
import Timeline from "./Timeline";
import ActivityWindowForm from "./ActivityWindowForm";
import OccupationForm from "./OccupationForm";
import AssignSlotButton from "./AssignSlotButton";
import WeekView from "./WeekView";

export default async function TimePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: occupations }, { data: tasks }] = await Promise.all([
    supabase.from("profiles").select("activity_window_start, activity_window_end").eq("user_id", user.id).single(),
    supabase.from("occupations").select("*").eq("user_id", user.id),
    supabase.from("tasks").select("id, title, est, status, impact")
  ]);

  if (!profile) throw new Error("Perfil no encontrado.");

  const windowStart = profile.activity_window_start.slice(0, 5);
  const windowEnd = profile.activity_window_end.slice(0, 5);
  const occs = (occupations ?? []).map((o) => ({ id: o.id, title: o.title, start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5), category: o.category, recurring: o.recurring }));
  const slots = availableSlots({ start: windowStart, end: windowEnd }, occs);
  const impactMinutes = (tasks ?? []).filter((t) => t.impact && t.status !== "Completed" && t.status !== "Cancelled").reduce((s, t) => s + (t.est ?? 0), 0);
  const sat = saturationStatus({ start: windowStart, end: windowEnd }, occs, impactMinutes);
  const pendingTasks = (tasks ?? []).filter((t) => t.status === "Pending" || t.status === "InProgress").map((t) => ({ id: t.id, title: t.title, est: t.est ?? 30 }));

  const isWeek = view === "week";
  const satKind = sat.status === "saturated" ? "bad" : sat.status === "warn" ? "warn" : "info";

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--purple) 9%, var(--surface))", borderLeft: "3px solid var(--purple)" }}>
        Define tus ocupaciones y tu rango de actividad diario para identificar espacios disponibles. La IA transversal solo
        advierte o sugiere; nunca reprograma nada sin tu confirmación (BR-018).
      </div>

      <div className="flex gap-1.5 rounded-2xl p-1.5" style={{ background: "var(--surface2)" }}>
        <Link href="/time" className="btn-sm rounded-xl" style={{ background: !isWeek ? "var(--surface)" : "transparent", minHeight: 34, padding: "5px 11px" }}>
          Vista del día
        </Link>
        <Link href="/time?view=week" className="btn-sm rounded-xl" style={{ background: isWeek ? "var(--surface)" : "transparent", minHeight: 34, padding: "5px 11px" }}>
          Vista semanal (7 días)
        </Link>
      </div>

      {isWeek ? (
        <WeekView windowStart={windowStart} windowEnd={windowEnd} occupations={occs} todayISO={todayLocal()} />
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-3.5">
            <Card hero>
              <div className="text-xs" style={{ opacity: 0.85 }}>
                Capacidad del día · rango {windowStart}–{windowEnd}
              </div>
              <div className="text-3xl font-black">{Math.round((sat.capMinutes / 60) * 10) / 10} h</div>
              <div className="flex justify-between mt-1.5 text-sm">
                <span>Comprometido</span>
                <b>
                  {Math.round((sat.totalCommitted / 60) * 10) / 10} h ({sat.pct}%)
                </b>
              </div>
              <div className="flex justify-between text-sm">
                <span>Disponible</span>
                <b>{Math.round((sat.availableMinutes / 60) * 10) / 10} h</b>
              </div>
              <div
                className="text-xs mt-2 p-2 rounded-lg"
                style={{ background: "rgba(255,255,255,.14)", border: "1px solid #fff", color: "#fff" }}
              >
                {sat.status === "saturated" ? "⚠ Tu día está saturado según ocupaciones + tareas de impacto." : sat.status === "warn" ? "Tu día se está llenando." : "Tienes margen disponible hoy."}
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="font-bold">Rango de actividad</h3>
                <ActivityWindowForm start={windowStart} end={windowEnd} />
              </div>
              <p className="text-sm my-2" style={{ color: "var(--muted)" }}>
                Por defecto 05:00–21:00. Determina dónde se calculan tus espacios disponibles (BR-017).
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Inicio" value={windowStart} />
                <Stat label="Fin" value={windowEnd} />
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold">Línea de tiempo del día</h3>
              <OccupationForm />
            </div>
            <Timeline windowStart={windowStart} windowEnd={windowEnd} occupations={occs} slots={slots} />
          </Card>

          <Card>
            <h3 className="font-bold mb-2">Espacios disponibles</h3>
            {!slots.length && <EmptyState icon="⏰" text="No hay espacios libres en tu rango de actividad." />}
            {slots.map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="grow">
                  <b>
                    {s.start} – {s.end}
                  </b>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {Math.round((s.minutes / 60) * 10) / 10} h disponibles
                  </div>
                </div>
                <AssignSlotButton slotLabel={`${s.start}–${s.end}`} tasks={pendingTasks} />
              </div>
            ))}
          </Card>

          <Card>
            <h3 className="font-bold mb-2">Tus ocupaciones</h3>
            {!occs.length && <EmptyState icon="📅" text="Registra tus ocupaciones fijas del día." />}
            {occs.map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="grow">
                  <b>{o.title}</b>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {o.start} – {o.end} · {o.category}
                    {o.recurring ? " · recurrente" : ""}
                  </div>
                </div>
                <OccupationForm occupation={o} />
              </div>
            ))}
          </Card>

          {sat.status !== "ok" && (
            <Card className="bg-[var(--surface2)]">
              <div className="flex items-center justify-between">
                <h3 className="font-bold">{sat.status === "saturated" ? "Advertencia de saturación" : "Alerta temprana"}</h3>
                <Chip kind={satKind === "bad" ? "bad" : "warn"}>{sat.pct}%</Chip>
              </div>
              <p className="my-2 text-sm">
                {sat.status === "saturated"
                  ? `Comprometiste ${Math.round((sat.totalCommitted / 60) * 10) / 10} h de ${Math.round((sat.capMinutes / 60) * 10) / 10} h disponibles.`
                  : `Vas en ${sat.pct}% de tu capacidad del día.`}
              </p>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Evidencia: {Math.round((sat.occupiedMinutes / 60) * 10) / 10} h en ocupaciones + {Math.round((sat.taskMinutes / 60) * 10) / 10} h en tareas de impacto, sobre{" "}
                {Math.round((sat.capMinutes / 60) * 10) / 10} h de capacidad.
              </div>
              <div className="text-xs p-2 rounded-lg mt-2" style={{ background: "color-mix(in srgb, var(--purple) 9%, var(--surface))", borderLeft: "3px solid var(--purple)" }}>
                Sugerencia: prioriza tu Única Cosa en el primer espacio disponible. Recomendación explicable; no se aplica
                automáticamente (BR-018).
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
