"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeekPoint } from "@/lib/domain/development/habit-dashboard.ts";
import ChartTooltip from "./ChartTooltip";
import { diaCorto } from "./format";

/**
 * Cumplimiento por semana. Columnas finas (≤ 24px), punta redondeada y base
 * recta, un solo tono: las semanas no son categorías distintas, son la misma
 * serie en el tiempo.
 */
export default function WeeklyTrend({ data }: { data: WeekPoint[] }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="weekStart"
            tickFormatter={diaCorto}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--chart-grid)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as WeekPoint | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltip
                  value={p.pct === null ? "Sin nada que medir" : `${p.pct} %`}
                  label={`Semana del ${diaCorto(p.weekStart)}`}
                />
              );
            }}
          />
          <Bar dataKey="pct" fill="var(--chart-1)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
