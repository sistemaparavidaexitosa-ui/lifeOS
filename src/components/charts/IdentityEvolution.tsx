"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartTooltip from "./ChartTooltip";
import { diaCorto, diaLargo } from "./format";

/**
 * Evolución del Identity Score: una foto por noche (`identity_scores`) y el
 * valor de hoy al final. Línea de 2px con el último punto marcado y etiquetado,
 * que es el que importa; el resto se lee en el tooltip o en la tabla.
 */
export default function IdentityEvolution({ data }: { data: { date: string; score: number }[] }) {
  const ultimo = data.at(-1);
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 24, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={diaCorto}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { date: string; score: number } | undefined;
              if (!active || !p) return null;
              return <ChartTooltip value={`${p.score}`} label={diaLargo(p.date)} detail="Identity Score" />;
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === data.length - 1 && props.cx !== undefined && props.cy !== undefined ? (
                <g key="ultimo">
                  <circle cx={props.cx} cy={props.cy} r={4} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
                  <text x={props.cx} y={props.cy - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)">
                    {ultimo?.score}
                  </text>
                </g>
              ) : (
                <g key={`p${props.index}`} />
              )
            }
            activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
