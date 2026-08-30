// src/lib/domain/insights/facts/time.ts
// Extractor de hechos de Autogestión del Tiempo — función pura: sin Supabase,
// sin red, sin `new Date()`. El día de corte entra como parámetro (D-016/D-018).
//
// El cálculo de disponibilidad ya existe y NO se reescribe aquí: `saturationStatus`
// y `availableSlots` viven en domain/time.ts y son los mismos que pinta la
// pantalla. Este archivo solo decide QUÉ de ese cálculo merece contarse, y con
// cuánto peso. Si alguna vez difieren, el hecho mentiría respecto a la pantalla
// que el usuario tiene delante.

import { availableSlots, saturationStatus } from "../../time.ts";
import type { ActivityWindow, OccupationLike } from "../../types.ts";
import { clampWeight, type Fact } from "../types.ts";
import { overlapMinutes } from "./shared.ts";

export interface ImpactTaskLike {
  id: string;
  title: string;
  /** Minutos estimados (`tasks.est`). */
  est: number;
}

export interface TimeSnapshot {
  window: ActivityWindow;
  /** Ocupaciones que aplican HOY. Quien llama ya filtró con `occupationAppliesOn`. */
  todayOccupations: OccupationLike[];
  /** Tareas de impacto ABIERTAS. Sus minutos son el compromiso que no está en la agenda. */
  impactTasks: ImpactTaskLike[];
}

/**
 * El día comprometido por encima de su capacidad.
 *
 * Se reporta desde el 80 %, que es el mismo umbral con el que la pantalla ya
 * pone el aviso: el motor no inventa un criterio propio de "vas apretado".
 *
 * El peso arranca en 0.3 a ese 80 % y llega a 1 al 150 %. Deliberadamente no
 * arranca en 0: un hecho con peso cero sobrevive al recorte de contexto pero se
 * ordena el último, y un día al 80 % es exactamente el que todavía se puede
 * salvar. El que ya va al 130 % solo se puede lamentar.
 */
const SATURATION_FLOOR_PCT = 80;

function saturationFacts(snapshot: TimeSnapshot): Fact[] {
  const impactMinutes = snapshot.impactTasks.reduce((s, t) => s + t.est, 0);
  const status = saturationStatus(snapshot.window, snapshot.todayOccupations, impactMinutes);
  if (status.pct < SATURATION_FLOOR_PCT) return [];

  return [
    {
      id: "time.saturation",
      domain: "time",
      label:
        `Hoy tienes comprometido el ${status.pct} % de tu ventana de actividad: ` +
        `${status.occupiedMinutes} min de ocupaciones y ${status.taskMinutes} min de tareas de impacto ` +
        `sobre una capacidad de ${status.capMinutes} min (quedan ${status.availableMinutes} min libres)`,
      weight: clampWeight((status.pct - 50) / 100),
      refs: [{ table: "occupations", id: "hoy" }]
    }
  ];
}

/**
 * Dos ocupaciones del mismo día pisándose.
 *
 * La saturación no lo detecta y no es un descuido suyo: `occupiedMinutes` suma
 * los tramos recortados a la ventana, así que dos bloques encimados cuentan
 * DOS veces y el día parece más lleno de lo que está. El traslape es el hecho
 * contrario al de saturación —aquí sobra tiempo, no falta— y solo se ve
 * comparando los pares.
 *
 * El peso es la duración del choque: dos horas encimadas pesan 1.
 */
const FULL_WEIGHT_OVERLAP_MIN = 120;

function overlapFacts(snapshot: TimeSnapshot): Fact[] {
  const facts: Fact[] = [];
  const occ = snapshot.todayOccupations;
  for (let i = 0; i < occ.length; i++) {
    for (let j = i + 1; j < occ.length; j++) {
      const a = occ[i];
      const b = occ[j];
      if (!a || !b) continue;
      const minutes = overlapMinutes(a, b);
      if (minutes <= 0) continue;
      facts.push({
        id: `time.overlap.${a.id}.${b.id}`,
        domain: "time",
        label: `"${a.title}" (${a.start}-${a.end}) y "${b.title}" (${b.start}-${b.end}) se traslapan ${minutes} min hoy`,
        weight: clampWeight(minutes / FULL_WEIGHT_OVERLAP_MIN),
        refs: [
          { table: "occupations", id: a.id },
          { table: "occupations", id: b.id }
        ]
      });
    }
  }
  return facts;
}

/**
 * Una tarea de impacto que no cabe en ningún hueco libre del día.
 *
 * Es distinto de la saturación, y es la diferencia entre "vas justo" y "esto no
 * pasa hoy": el día puede estar al 60 % y aun así no tener un solo tramo
 * continuo de 90 minutos, porque los huecos están picados entre reuniones. La
 * suma no lo ve; los tramos sí.
 *
 * Se reporta UNA sola vez, por la tarea más grande que no entra. Repetirlo por
 * cada tarea sería el mismo hallazgo dicho cinco veces, y el recorte de
 * contexto expulsaría hechos de otros dominios para hacerles sitio.
 */
function noSlotFacts(snapshot: TimeSnapshot): Fact[] {
  if (!snapshot.impactTasks.length) return [];
  const slots = availableSlots(snapshot.window, snapshot.todayOccupations);
  const largestSlot = slots.reduce((max, s) => Math.max(max, s.minutes), 0);

  const noCaben = snapshot.impactTasks.filter((t) => t.est > largestSlot);
  if (!noCaben.length) return [];
  const peor = noCaben.reduce((a, b) => (b.est > a.est ? b : a));

  return [
    {
      id: `time.impact-no-slot.${peor.id}`,
      domain: "time",
      label:
        `"${peor.title}" necesita ${peor.est} min seguidos y el hueco libre más largo de hoy es de ${largestSlot} min` +
        (noCaben.length > 1 ? ` (hay ${noCaben.length} tareas de impacto en la misma situación)` : ""),
      weight: clampWeight((peor.est - largestSlot) / peor.est),
      refs: [{ table: "tasks", id: peor.id }]
    }
  ];
}

/** Todos los hechos de tiempo, ordenados de más a menos anómalo. */
export function timeFacts(snapshot: TimeSnapshot): Fact[] {
  return [...saturationFacts(snapshot), ...overlapFacts(snapshot), ...noSlotFacts(snapshot)].sort(
    (a, b) => b.weight - a.weight
  );
}
