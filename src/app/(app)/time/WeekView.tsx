import { timeToMin } from "@/lib/domain/time.ts";
import DayEditor from "./DayEditor";

interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
  category: string;
  recurring: boolean;
  date: string | null; // occ_date; null si recurring=true
}

interface TaskLite {
  id: string;
  title: string;
  est: number;
}

interface DueTaskLite {
  id: string;
  title: string;
  est: number;
  status: string;
  due: string | null;
}

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function weekDatesFrom(todayISO: string): string[] {
  const d = new Date(`${todayISO}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setUTCDate(monday.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

/**
 * FR-TIM-008 — ACTUALIZADO: la vista semanal ahora refleja EXACTAMENTE la
 * ocupación particular de cada día (antes repetía el mismo conjunto de
 * ocupaciones en los 7 días, incluidas las no-recurrentes — bug real
 * corregido con la columna occ_date, migración
 * 0016_time_occupation_date.sql). Cada ocupación recurring=true se muestra
 * en los 7 días; cada ocupación con occ_date específico SOLO se muestra en
 * ese día. Además, cada día ahora es editable directamente desde esta
 * vista mediante <DayEditor> (antes era de solo lectura y la edición
 * redirigía siempre a /time, limitado al día actual).
 */
export default function WeekView({
  windowStart,
  windowEnd,
  occupations,
  todayISO,
  pendingTasks,
  dueTasks
}: {
  windowStart: string;
  windowEnd: string;
  occupations: OccupationLite[];
  todayISO: string;
  pendingTasks: TaskLite[];
  dueTasks: DueTaskLite[];
}) {
  const startMin = timeToMin(windowStart);
  const endMin = timeToMin(windowEnd);
  const totalMin = Math.max(1, endMin - startMin);
  const dates = weekDatesFrom(todayISO);

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <b>Semana · 7 líneas de tiempo</b>
      <div className="text-xs" style={{ color: "var(--muted)", margin: "4px 0 8px" }}>
        Cada línea refleja exactamente las ocupaciones de ese día (recurrentes 🔁 + específicas). Usa &quot;Editar
        {"{día}"}&quot; para agregar/editar ocupaciones y tareas de ese día en particular (FR-TIM-001/008).
      </div>

      {dates.map((d, i) => {
        const isToday = d === todayISO;
        const dayOccs = occupations.filter((o) => o.recurring || o.date === d);
        const dayDueTasks = dueTasks.filter((t) => t.due === d);
        const dayLabel = `${DAY_NAMES[i]}${isToday ? " (hoy)" : ""}`;

        return (
          <div key={d} style={{ marginTop: 10, paddingTop: 10, borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
            <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between" }}>
              <b className="text-sm">{dayLabel}</b>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {d}
              </span>
            </div>
            <div
              className="relative rounded-2xl mt-1.5"
              style={{ position: "relative", height: 40, background: "var(--surface2)", borderRadius: 14, overflow: "hidden" }}
            >
              {dayOccs.map((o, j) => {
                const s = Math.max(timeToMin(o.start), startMin);
                const e = Math.min(timeToMin(o.end), endMin);
                if (e <= s) return null;
                const left = ((s - startMin) / totalMin) * 100;
                const width = ((e - s) / totalMin) * 100;
                return (
                  <div
                    key={j}
                    title={`${o.title} (${o.start}–${o.end})`}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      width: `${width}%`,
                      top: 4,
                      bottom: 4,
                      background: o.recurring ? "var(--accent)" : "var(--info)",
                      borderRadius: 8,
                      opacity: 0.85
                    }}
                  />
                );
              })}
            </div>
            <DayEditor
              dayISO={d}
              dayLabel={dayLabel}
              windowStart={windowStart}
              windowEnd={windowEnd}
              occupations={dayOccs}
              pendingTasks={pendingTasks}
              dueTasks={dayDueTasks}
            />
          </div>
        );
      })}

      <div className="text-xs" style={{ color: "var(--muted)", marginTop: 10 }}>
        Rango de actividad {windowStart}–{windowEnd}. Las ocupaciones marcadas 🔁 se repiten todos los días; el resto
        pertenece únicamente al día donde aparecen.
      </div>
    </div>
  );
}
