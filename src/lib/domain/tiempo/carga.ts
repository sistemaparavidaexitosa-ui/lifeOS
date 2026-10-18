// src/lib/domain/tiempo/carga.ts
// Cuánto le pide HOY cada sección a la persona, contra su ventana de actividad
// (rediseño: /time y /planning en una). Puro, probado en
// tests/domain/tiempo-carga.test.ts.
//
// EL TIEMPO SE ASIGNA EN MUCHOS SITIOS: una ocupación en Tiempo, el estimado de
// una tarea en Execution, la duración de los hábitos en Rutinas. Cada pantalla
// veía solo lo suyo, y así es como un día se llena sin que ninguna lo note. La
// carga los suma en un solo número para que la persona no se sature.
//
// SIN DOBLE CUENTA: una rutina ligada a una ocupación ya está dentro de esa
// ocupación; una tarea hecha o de otro día no pide nada hoy.

import { capacityMinutes, occupiedMinutes } from "../time.ts";
import type { ActivityWindow } from "../types.ts";
import { routineDueToday, type Frequency } from "../development/routines.ts";

export interface EntradaDeCarga {
  hoy: string;
  ventana: ActivityWindow;
  /** Ya filtradas a las que aplican hoy. */
  ocupaciones: { start: string; end: string }[];
  tareas: { est: number | null; due: string | null; impact: boolean; status: string }[];
  rutinas: { frequency: Frequency; active: boolean; ligadaAOcupacion: boolean; minutos: number }[];
}

export type FuenteDeCarga = "ocupaciones" | "tareas" | "rutinas";
export type EstadoDeCarga = "ok" | "lleno" | "saturado";

export interface ParteDeCarga {
  fuente: FuenteDeCarga;
  etiqueta: string;
  minutos: number;
  href: string;
}

export interface CargaDelDia {
  capMin: number;
  partes: ParteDeCarga[];
  total: number;
  libre: number;
  pct: number;
  estado: EstadoDeCarga;
  consejo: string;
}

/** Lo que se deja libre para imprevistos: más allá de esto, el día ya está lleno. */
const MARGEN = 0.2;
const ABIERTAS = new Set(["Pending", "InProgress", "Blocked", "Rescheduled"]);

const horas = (m: number) => {
  const h = Math.round((m / 60) * 10) / 10;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
};

export function cargaDelDia(e: EntradaDeCarga): CargaDelDia {
  const capMin = capacityMinutes(e.ventana);
  // `occupiedMinutes` solo lee inicio y fin; el título y el id no cuentan aquí.
  const ocupaciones = occupiedMinutes(e.ventana, e.ocupaciones.map((o, i) => ({ ...o, id: String(i), title: "" })));
  // Hoy: lo que vence hoy, y lo de impacto sin fecha (es lo que se planea hacer ya).
  const tareas = e.tareas
    .filter((t) => ABIERTAS.has(t.status) && (t.due === e.hoy || (t.impact && !t.due)))
    .reduce((s, t) => s + (t.est ?? 30), 0);
  const rutinas = e.rutinas
    .filter((r) => r.active && !r.ligadaAOcupacion && routineDueToday(r.frequency, e.hoy))
    .reduce((s, r) => s + r.minutos, 0);

  const partes: ParteDeCarga[] = [
    { fuente: "ocupaciones", etiqueta: "Ocupaciones", minutos: ocupaciones, href: "/time" },
    { fuente: "tareas", etiqueta: "Tareas de hoy", minutos: tareas, href: "/execution" },
    { fuente: "rutinas", etiqueta: "Rutinas", minutos: rutinas, href: "/development/routines" }
  ];
  const total = ocupaciones + tareas + rutinas;
  const pct = capMin ? Math.round((total / capMin) * 100) : 100;
  const estado: EstadoDeCarga = !capMin || total > capMin ? "saturado" : total >= capMin * (1 - MARGEN) ? "lleno" : "ok";
  const libre = Math.max(0, capMin - total);

  const consejo =
    estado === "saturado"
      ? capMin
        ? `Te pasas ${horas(total - capMin)} de tu ventana. Mueve tareas a otro día o suelta una ocupación antes de sumar nada.`
        : "Tu ventana de actividad está vacía: ajústala para que el día tenga capacidad."
      : estado === "lleno"
        ? `Vas al ${pct} %. Deja este margen para imprevistos: no agregues más hoy.`
        : `Tienes ${horas(libre)} libres. Protégelas para tu una cosa antes de llenarlas.`;

  return { capMin, partes, total, libre, pct, estado, consejo };
}
