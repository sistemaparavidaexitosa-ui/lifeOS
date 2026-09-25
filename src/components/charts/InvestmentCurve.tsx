"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PuntoDeCurva } from "@/lib/domain/money/curva-inversion.ts";
import { money, money0 } from "@/lib/format";
import ChartTooltip from "./ChartTooltip";
import { diaCorto, diaLargo } from "./format";

/**
 * La evolución de una inversión (o de todas). El VALOR es la serie que se lee
 * —área con lavado y línea de 2px—; el CAPITAL aportado va punteado y en gris:
 * es la referencia contra la que el valor gana o pierde, no otra serie igual
 * de importante. Entre dos movimientos no se inventan puntos.
 */
export default function InvestmentCurve({ data, currency, locale }: { data: PuntoDeCurva[]; currency: string; locale: string }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="fecha"
            tickFormatter={diaCorto}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => money0(v, currency, locale)}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as PuntoDeCurva | undefined;
              if (!active || !p) return null;
              return <ChartTooltip value={money(p.valor, currency, locale)} label={diaLargo(p.fecha)} detail={`Capital aportado ${money(p.capital, currency, locale)}`} />;
            }}
          />
          <Line
            type="stepAfter"
            dataKey="capital"
            stroke="var(--muted)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="valor"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="var(--chart-1)"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
