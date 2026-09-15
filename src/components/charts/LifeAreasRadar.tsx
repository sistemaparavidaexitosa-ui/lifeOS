"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import ChartTooltip from "./ChartTooltip";

/**
 * Cumplimiento de 30 días por área de vida. Solo se usa con tres áreas o más:
 * con dos, un radar es una línea y miente sobre la forma (la página pinta
 * barras en ese caso).
 */
export default function LifeAreasRadar({ data }: { data: { area: string; pct: number | null }[] }) {
  const puntos = data.map((d) => ({ area: d.area, pct: d.pct ?? 0, sinDatos: d.pct === null }));
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={puntos} outerRadius="62%" margin={{ top: 8, right: 36, bottom: 8, left: 36 }}>
          <PolarGrid stroke="var(--chart-grid)" />
          <PolarAngleAxis dataKey="area" tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof puntos)[number] | undefined;
              if (!active || !p) return null;
              return <ChartTooltip value={p.sinDatos ? "Sin nada que medir" : `${p.pct} %`} label={p.area} detail="Últimos 30 días" />;
            }}
          />
          <Radar
            dataKey="pct"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="var(--chart-1)"
            fillOpacity={0.1}
            dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
