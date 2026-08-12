import { timeToMin } from "@/lib/domain/time.ts";
import type { Slot } from "@/lib/domain/time.ts";

interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
}

/** FR-TIM-006: línea de tiempo del día con ocupaciones y espacios disponibles. */
export default function Timeline({
  windowStart,
  windowEnd,
  occupations,
  slots
}: {
  windowStart: string;
  windowEnd: string;
  occupations: OccupationLite[];
  slots: Slot[];
}) {
  const startMin = timeToMin(windowStart);
  const endMin = timeToMin(windowEnd);
  const totalMin = Math.max(1, endMin - startMin);
  const nowMin = (() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  })();

  return (
    <div>
      <div className="relative rounded-2xl overflow-hidden" style={{ background: "var(--surface2)", height: 56 }}>
        {occupations.map((o) => {
          const s = Math.max(timeToMin(o.start), startMin);
          const e = Math.min(timeToMin(o.end), endMin);
          if (e <= s) return null;
          const left = ((s - startMin) / totalMin) * 100;
          const width = ((e - s) / totalMin) * 100;
          return (
            <div
              key={o.id}
              title={`${o.title} (${o.start}–${o.end})`}
              className="absolute rounded-lg flex items-center px-1.5 text-[10px] font-extrabold overflow-hidden whitespace-nowrap"
              style={{
                top: 6,
                height: 44,
                left: `${left}%`,
                width: `${width}%`,
                background: "linear-gradient(90deg, #ffb4b8, var(--danger))",
                color: "#4a0d10"
              }}
            >
              {o.title}
            </div>
          );
        })}
        {slots.map((s, i) => {
          const sm = timeToMin(s.start);
          const em = timeToMin(s.end);
          const left = ((sm - startMin) / totalMin) * 100;
          const width = ((em - sm) / totalMin) * 100;
          return (
            <div
              key={i}
              title={`Disponible ${s.start}–${s.end}`}
              className="absolute rounded-lg flex items-center px-1.5 text-[10px] font-extrabold overflow-hidden whitespace-nowrap"
              style={{
                top: 6,
                height: 44,
                left: `${left}%`,
                width: `${width}%`,
                background: "color-mix(in srgb, var(--ok) 22%, var(--surface2))",
                color: "var(--ok)",
                border: "1px dashed color-mix(in srgb, var(--ok) 50%, transparent)"
              }}
            >
              Libre
            </div>
          );
        })}
        {nowMin >= startMin && nowMin <= endMin && (
          <div className="absolute top-0 bottom-0 w-0.5 z-10" style={{ left: `${((nowMin - startMin) / totalMin) * 100}%`, background: "var(--accent-d)" }} title="Ahora" />
        )}
      </div>
      <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--muted)" }}>
        <span>{windowStart}</span>
        <span>{windowEnd}</span>
      </div>
    </div>
  );
}
