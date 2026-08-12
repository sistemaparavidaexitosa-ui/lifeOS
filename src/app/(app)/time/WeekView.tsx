import { timeToMin } from "@/lib/domain/time.ts";

interface OccupationLite {
  start: string;
  end: string;
  title: string;
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
 * FR-TIM-008: vista semanal de 7 líneas de tiempo, de SOLO LECTURA respecto a
 * la creación de ocupaciones (la edición vive en la vista diaria, FR-TIM-001).
 * En el MVP las ocupaciones recurrentes se muestran igual cada día.
 */
export default function WeekView({
  windowStart,
  windowEnd,
  occupations,
  todayISO
}: {
  windowStart: string;
  windowEnd: string;
  occupations: OccupationLite[];
  todayISO: string;
}) {
  const startMin = timeToMin(windowStart);
  const endMin = timeToMin(windowEnd);
  const totalMin = Math.max(1, endMin - startMin);
  const dates = weekDatesFrom(todayISO);

  return (
    <div className="card">
      <h3 className="font-bold mb-1">Semana · 7 líneas de tiempo</h3>
      <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
        Vista de solo lectura. Para crear o editar ocupaciones usa la vista del día (FR-TIM-008).
      </p>
      {dates.map((d, i) => {
        const isToday = d === todayISO;
        return (
          <div key={d} className="my-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <b>
                {DAY_NAMES[i]}
                {isToday ? " (hoy)" : ""}
              </b>
              <span style={{ color: "var(--muted)" }}>{d}</span>
            </div>
            <div className="relative rounded-lg overflow-hidden" style={{ background: "var(--surface2)", height: 28 }}>
              {occupations.map((o, j) => {
                const s = Math.max(timeToMin(o.start), startMin);
                const e = Math.min(timeToMin(o.end), endMin);
                if (e <= s) return null;
                const left = ((s - startMin) / totalMin) * 100;
                const width = ((e - s) / totalMin) * 100;
                return (
                  <div
                    key={j}
                    title={o.title}
                    className="absolute rounded"
                    style={{ top: 3, height: 22, left: `${left}%`, width: `${width}%`, background: "linear-gradient(90deg, #ffb4b8, var(--danger))", opacity: 0.9 }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="text-xs p-2.5 rounded-r-xl mt-2" style={{ background: "color-mix(in srgb, var(--info) 9%, var(--surface))", borderLeft: "3px solid var(--info)" }}>
        Cada línea representa el rango de actividad {windowStart}–{windowEnd} con tus ocupaciones recurrentes.
      </div>
    </div>
  );
}
