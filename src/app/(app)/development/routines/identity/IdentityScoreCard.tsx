import { Card, Progress } from "@/components/ui";
import type { IdentityScore } from "@/lib/domain/identity/score.ts";

function tono(score: number): string {
  return score >= 70 ? "var(--ok)" : score >= 40 ? "var(--warn)" : "var(--danger)";
}

/**
 * El Identity Score de hoy: el número, el cambio frente a hace una semana y de
 * dónde sale. El desglose no es opcional —un número que no se explica no se
 * puede mover—, y cada componente dice qué mide. Los que no tienen datos se
 * enseñan como tales, no como un 0.
 */
export default function IdentityScoreCard({ score, delta7 }: { score: IdentityScore; delta7: number | null }) {
  const valor = score.score;
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div
          className="rounded-full grid place-items-center flex-shrink-0"
          style={{
            width: 88,
            height: 88,
            background: `conic-gradient(${valor === null ? "var(--surface3)" : tono(valor)} ${valor ?? 0}%, var(--surface2) 0)`
          }}
          role="img"
          aria-label={valor === null ? "Identity Score sin datos" : `Identity Score ${valor} de 100`}
        >
          <div className="rounded-full grid place-items-center" style={{ width: 70, height: 70, background: "var(--surface)" }}>
            <span className="text-2xl font-bold">{valor ?? "—"}</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Identity Score
          </span>
          <b className="text-sm leading-snug">¿Qué tan alineadas están tus acciones con quien quieres ser?</b>
          {delta7 !== null && (
            <span
              className="text-xs font-semibold"
              style={{ color: delta7 > 0 ? "var(--ok)" : delta7 < 0 ? "var(--danger)" : "var(--muted)" }}
            >
              {delta7 > 0 ? `+${delta7}` : delta7 < 0 ? `−${Math.abs(delta7)}` : "Sin cambio"} frente a hace una semana
            </span>
          )}
          {valor === null && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Aparece en cuanto tengas hábitos con días que juzgar.
            </span>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-2 mt-4">
        {score.components.map((c) => (
          <li key={c.key} className="flex flex-col gap-1" title={c.help}>
            <div className="flex justify-between gap-2 text-xs">
              <span className="font-semibold">
                {c.label}
                <span className="font-normal ml-1" style={{ color: "var(--muted)" }}>
                  · peso {c.weight}
                </span>
              </span>
              <span style={{ color: "var(--muted)" }}>{c.value === null ? "sin datos" : `${c.value}`}</span>
            </div>
            {c.value !== null && <Progress pct={c.value} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}
