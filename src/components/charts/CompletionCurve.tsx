"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayPoint } from "@/lib/domain/development/habit-dashboard.ts";
import ChartTooltip from "./ChartTooltip";
import { diaCorto, diaLargo } from "./format";

/**
 * Curva de cumplimiento diario. Área con lavado al 10 % y línea de 2px; los
 * días sin nada que juzgar dejan un hueco en vez de caer a cero, porque un
 * domingo sin rutinas no es un día en blanco.
 *
 * La línea del 80 % marca el umbral de día sólido: es la única referencia que
 * la pantalla usa en otro sitio (Días sólidos, Disciplina), y sin ella la
 * curva no diría cuándo un día contó.
 */
export default function CompletionCurve({ data }: { data: DayPoint[] }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={diaCorto}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine
            y={80}
            stroke="var(--muted)"
            strokeOpacity={0.5}
            label={{ value: "Sólido", position: "insideTopRight", fill: "var(--muted)", fontSize: 10 }}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as DayPoint | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltip
                  value={p.pct === null ? "Sin nada que medir" : `${p.pct} %`}
                  label={diaLargo(p.date)}
                  detail={p.judged ? `${p.done} de ${p.judged} hábitos` : undefined}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="pct"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="var(--chart-1)"
            fillOpacity={0.1}
            connectNulls={false}
            dot={false}
            activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
