import type { StreakSegment } from "@/lib/domain/development/habit-dashboard.ts";
import { diffDays } from "@/lib/domain/datetime.ts";
import { diaCorto } from "./format";

/**
 * Línea de tiempo de rachas: una fila por hábito y un tramo por racha dentro
 * del rango.
 *
 * Rejilla con posiciones en porcentaje, pintada en el servidor. Recharts no
 * tiene barras de rango con varios tramos por fila sin inventar una serie por
 * tramo, y esto sale en veinte líneas sin JavaScript. Cada tramo lleva su
 * texto accesible.
 */
export default function StreakTimeline({
  segments,
  habits,
  from,
  today
}: {
  segments: (StreakSegment & { habitName: string })[];
  habits: { id: string; name: string }[];
  from: string;
  today: string;
}) {
  const total = diffDays(from, today) + 1;
  const pos = (iso: string) => (Math.max(0, diffDays(from, iso)) / total) * 100;

  return (
    <div className="flex flex-col gap-2">
      {habits.map((h) => {
        const suyos = segments.filter((s) => s.habitId === h.id);
        return (
          <div key={h.id} className="grid items-center gap-2" style={{ gridTemplateColumns: "minmax(0, 8rem) 1fr" }}>
            <span className="text-xs truncate" title={h.name}>
              {h.name}
            </span>
            <div className="relative rounded" style={{ height: 12, background: "var(--surface2)" }}>
              {suyos.map((s) => (
                <span
                  key={s.start}
                  role="img"
                  tabIndex={0}
                  className="absolute top-0 bottom-0 heat-cell"
                  aria-label={`${h.name}: racha de ${s.length}, del ${diaCorto(s.start)} al ${diaCorto(s.end)}`}
                  title={`${s.length} seguidos · ${diaCorto(s.start)} – ${diaCorto(s.end)}`}
                  style={{
                    aspectRatio: "auto",
                    left: `${pos(s.start)}%`,
                    width: `max(4px, calc(${pos(s.end) - pos(s.start) + 100 / total}% - 2px))`,
                    background: "var(--chart-1)"
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="grid gap-2 text-[11px]" style={{ gridTemplateColumns: "minmax(0, 8rem) 1fr", color: "var(--muted)" }}>
        <span />
        <span className="flex justify-between">
          <span>{diaCorto(from)}</span>
          <span>Hoy</span>
        </span>
      </div>
    </div>
  );
}
