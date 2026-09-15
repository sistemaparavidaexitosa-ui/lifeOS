import type { HeatMonth } from "@/lib/data/habit-analytics";
import { diaLargo, nombreMes } from "./format";

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Cinco tramos de un solo tono, de claro a oscuro. Tramos y no un degradado
 * continuo: pasado cierto número de clases el ojo deja de distinguirlas, y
 * cinco se leen sin leyenda larga.
 */
const TRAMOS = [
  { hasta: 19, mezcla: 18 },
  { hasta: 39, mezcla: 36 },
  { hasta: 59, mezcla: 54 },
  { hasta: 79, mezcla: 74 },
  { hasta: 100, mezcla: 100 }
];

function fondo(pct: number | null): string {
  if (pct === null) return "var(--surface2)";
  const tramo = TRAMOS.find((t) => pct <= t.hasta) ?? TRAMOS[TRAMOS.length - 1]!;
  return `color-mix(in srgb, var(--chart-1) ${tramo.mezcla}%, var(--surface2))`;
}

/**
 * Heatmap mensual del cumplimiento diario. Rejilla CSS en el servidor y no
 * Recharts, que no tiene calendario: cero JavaScript, y cada celda lleva su
 * valor en `title` y `aria-label`, así que se lee con teclado y sin hover.
 */
export default function MonthlyHeatmap({ months }: { months: HeatMonth[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 190px), 1fr))" }}>
        {months.map((m) => (
          <figure key={m.month} className="flex flex-col gap-1.5 m-0">
            <figcaption className="text-xs font-semibold">{nombreMes(m.month)}</figcaption>
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {DIAS.map((d) => (
                <span key={d} className="text-[10px] text-center" style={{ color: "var(--muted)" }} aria-hidden="true">
                  {d}
                </span>
              ))}
              {m.weeks.flat().map((c, i) =>
                c === null ? (
                  <span key={i} aria-hidden="true" />
                ) : (
                  <span
                    key={c.date}
                    className="heat-cell"
                    tabIndex={0}
                    role="img"
                    title={`${diaLargo(c.date)}: ${c.pct === null ? "sin nada que medir" : `${c.pct} %`}`}
                    aria-label={`${diaLargo(c.date)}: ${c.pct === null ? "sin nada que medir" : `${c.pct} por ciento`}`}
                    style={{ background: fondo(c.pct) }}
                  />
                )
              )}
            </div>
          </figure>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--muted)" }} aria-hidden="true">
        <span>Menos</span>
        {[null, 10, 30, 50, 70, 100].map((v, i) => (
          <span key={i} className="inline-block rounded" style={{ width: 12, height: 12, background: fondo(v) }} />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}
