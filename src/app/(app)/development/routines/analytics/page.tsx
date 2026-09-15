import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, Progress } from "@/components/ui";
import { getSessionUser } from "@/lib/data/session";
import { loadDashboard } from "@/lib/data/habit-analytics";
import { parseRango } from "@/lib/domain/development/habit-dashboard.ts";
import ChartCard from "@/components/charts/ChartCard";
import MetricCard from "@/components/charts/MetricCard";
import CompletionCurve from "@/components/charts/CompletionCurve";
import WeeklyTrend from "@/components/charts/WeeklyTrend";
import LifeAreasRadar from "@/components/charts/LifeAreasRadar";
import MonthlyHeatmap from "@/components/charts/MonthlyHeatmap";
import StreakTimeline from "@/components/charts/StreakTimeline";
import { diaCorto, pct, puntos } from "@/components/charts/format";
import RangePicker from "./RangePicker";
import HabitTable from "./HabitTable";

const RANGO_LABEL = { 7: "7 días", 30: "30 días", 90: "90 días", 365: "1 año" } as const;

function signo(n: number | null): boolean | null {
  return n === null || n === 0 ? null : n > 0;
}

/**
 * Analítica de Rutinas (F2). Todo lo que se ve sale de `loadDashboard`, que
 * delega cada cifra en `habit-dashboard.ts`: aquí solo se decide dónde va.
 */
export default async function RoutinesAnalyticsPage({ searchParams }: { searchParams: Promise<{ rango?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const rango = parseRango((await searchParams).rango);
  const d = await loadDashboard(rango);

  if (!d.hasHabits) {
    return (
      <Card>
        <EmptyState icon="📈" text="Aún no hay hábitos que medir. Crea una rutina en Hoy y la analítica empieza a llenarse desde el primer registro." />
        <div className="flex justify-center mt-2">
          <Link href="/development/routines" className="btn-primary btn-sm">
            Ir a Hoy
          </Link>
        </div>
      </Card>
    );
  }

  const rangoLabel = RANGO_LABEL[rango];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RangePicker value={rango} />
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Del {diaCorto(d.from)} a hoy
        </span>
      </div>

      {d.daysOfData < 7 && (
        <Card>
          <p className="text-sm">
            Llevas {d.daysOfData} {d.daysOfData === 1 ? "día" : "días"} registrando. Las tendencias necesitan al menos una semana para decir
            algo; mientras tanto, lo más fiable es la racha.
          </p>
        </Card>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))" }}>
        <MetricCard label="Días sólidos" value={`${d.solidStreak}`} hint="Seguidos con 80 % o más de lo que tocaba" />
        <MetricCard label="Hoy" value={pct(d.periods.day)} hint={d.periods.day === null ? "Aún no registras nada hoy" : "De lo que ya registraste"} />
        <MetricCard
          label="Esta semana"
          value={pct(d.periods.week)}
          hint={`Mes ${pct(d.periods.month)} · Trimestre ${pct(d.periods.quarter)} · Año ${pct(d.periods.year)}`}
        />
        <MetricCard
          label="Últimos 30 días"
          value={pct(d.monthTrend.current)}
          delta={d.monthTrend.delta === null ? undefined : { text: `${puntos(d.monthTrend.delta)} pts vs. 30 días previos`, good: signo(d.monthTrend.delta) }}
        />
        <MetricCard label={`Éxito · ${rangoLabel}`} value={pct(d.success)} hint="Veces que apareciste, sin mirar cuánto" />
        <MetricCard label="Disciplina" value={pct(d.discipline)} hint="Días sólidos entre los últimos 30" />
        <MetricCard
          label="Momentum"
          value={d.momentum === null ? "—" : `${puntos(d.momentum)} pts`}
          delta={d.momentum === null ? undefined : { text: d.momentum > 0 ? "Acelerando" : d.momentum < 0 ? "Frenando" : "Estable", good: signo(d.momentum) }}
          hint="Últimos 7 días frente a 30"
        />
        <MetricCard
          label="Mejor racha"
          value={d.best ? `${d.best.value} ${d.best.unit === "semana" ? (d.best.value === 1 ? "semana" : "semanas") : d.best.value === 1 ? "día" : "días"}` : "—"}
          hint={d.best ? d.best.habitName : "Aún sin rachas"}
        />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <ChartCard
          title="Curva de cumplimiento"
          subtitle={`Cada día, cuánto de lo que tocaba · ${rangoLabel}`}
          table={{ head: ["Día", "Cumplimiento", "Hábitos"], rows: d.curve.filter((p) => p.pct !== null).map((p) => [diaCorto(p.date), `${p.pct} %`, `${p.done} de ${p.judged}`]) }}
        >
          <CompletionCurve data={d.curve} />
        </ChartCard>

        <ChartCard
          title="Tendencia semanal"
          subtitle="Cumplimiento por semana, de lunes a domingo"
          table={{ head: ["Semana", "Cumplimiento"], rows: d.weeks.map((w) => [diaCorto(w.weekStart), pct(w.pct)]) }}
        >
          <WeeklyTrend data={d.weeks} />
        </ChartCard>
      </div>

      <ChartCard title="Mapa de calor" subtitle="Cada casilla es un día; más oscuro, más cumplido">
        <MonthlyHeatmap months={d.heatmap} />
      </ChartCard>

      <div className="grid gap-3.5 md:grid-cols-2">
        <ChartCard title="Línea de rachas" subtitle={`Tramos seguidos de cada hábito · ${rangoLabel}`}>
          <StreakTimeline segments={d.segments} habits={d.rows.map((r) => ({ id: r.habitId, name: r.name }))} from={d.from} today={d.today} />
        </ChartCard>

        <ChartCard
          title="Áreas de vida"
          subtitle="Cumplimiento de 30 días por área"
          table={{ head: ["Área", "Cumplimiento"], rows: d.areas.map((a) => [a.area, pct(a.pct)]) }}
        >
          {d.areas.length >= 3 ? (
            <LifeAreasRadar data={d.areas} />
          ) : (
            <div className="flex flex-col gap-3">
              {d.areas.map((a) => (
                <div key={a.area} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">{a.area}</span>
                    <span style={{ color: "var(--muted)" }}>{pct(a.pct)}</span>
                  </div>
                  <Progress pct={a.pct ?? 0} />
                </div>
              ))}
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Con tres áreas o más esto se dibuja como radar.
              </p>
            </div>
          )}
        </ChartCard>
      </div>

      <HabitTable rows={d.rows} rangoLabel={rangoLabel} />
    </div>
  );
}
