import { Card } from "@/components/ui";
import type { DashboardRow } from "@/lib/data/habit-analytics";
import { pct } from "@/components/charts/format";

function unidad(n: number, u: "día" | "semana"): string {
  if (u === "semana") return `${n} sem`;
  return `${n} d`;
}

/**
 * Una fila por hábito, ordenada por consistencia. Es también la vista en tabla
 * del radar y de la línea de rachas: todo lo que esas gráficas dibujan se lee
 * aquí en números.
 */
export default function HabitTable({ rows, rangoLabel }: { rows: DashboardRow[]; rangoLabel: string }) {
  const masOmitidos = [...rows].filter((r) => r.misses > 0).sort((a, b) => b.misses - a.misses).slice(0, 3);

  return (
    <Card className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-bold text-sm">Hábito por hábito</h3>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Consistencia = 70 % lo que haces ahora (la última semana pesa el doble) + 30 % los últimos 90 días.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums", minWidth: 560 }}>
          <thead>
            <tr className="text-xs" style={{ color: "var(--muted)" }}>
              <th scope="col" className="text-left font-semibold py-2 pr-2">Hábito</th>
              <th scope="col" className="text-right font-semibold py-2 px-2">Consistencia</th>
              <th scope="col" className="text-right font-semibold py-2 px-2">{rangoLabel}</th>
              <th scope="col" className="text-right font-semibold py-2 px-2">Racha</th>
              <th scope="col" className="text-right font-semibold py-2 px-2">Mejor</th>
              <th scope="col" className="text-right font-semibold py-2 pl-2">Omisiones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.habitId} style={{ borderTop: "1px solid var(--line)" }}>
                <th scope="row" className="text-left font-semibold py-2 pr-2" style={{ overflowWrap: "anywhere" }}>
                  {r.name}
                  <span className="block text-[11px] font-normal" style={{ color: "var(--muted)" }}>
                    {r.category}
                  </span>
                </th>
                <td className="text-right py-2 px-2">{pct(r.consistency)}</td>
                <td className="text-right py-2 px-2">{pct(r.rateRange)}</td>
                <td className="text-right py-2 px-2">{unidad(r.current, r.unit)}</td>
                <td className="text-right py-2 px-2">{unidad(r.longest, r.unit)}</td>
                <td className="text-right py-2 pl-2">{r.misses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {masOmitidos.length > 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Lo que más se queda sin hacer: {masOmitidos.map((r) => `${r.name} (${r.misses})`).join(", ")}.
        </p>
      )}
    </Card>
  );
}
