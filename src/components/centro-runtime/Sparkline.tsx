"use client";
import { trazo } from "@/lib/domain/centro/agente/grafica.ts";
import type { Tono } from "@/lib/domain/centro/runtime/secciones.ts";

export default function Sparkline({
  puntos,
  tono,
  ancho = 64,
  alto = 22
}: {
  puntos: number[];
  tono: Tono | null;
  ancho?: number;
  alto?: number;
}) {
  return (
    <svg className={`ag-spark ag-tono-${tono ?? "info"}`} width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden>
      <path d={trazo(puntos, ancho, alto)} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
