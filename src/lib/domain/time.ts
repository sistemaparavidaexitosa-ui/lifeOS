// Autogestión del Tiempo — FR-TIM-001…008, BR-017/018.
// Cálculo determinista de disponibilidad (ADR-012): la IA solo añade
// advertencias/sugerencias explicables SOBRE este cálculo; nunca reprograma.

import type { ActivityWindow, OccupationLike } from "./types.ts";

export function timeToMin(t: string): number {
  const parts = t.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

export function minToTime(mRaw: number): string {
  const m = ((mRaw % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/** Forma mínima para decidir si una ocupación aplica en un día dado. */
export interface OccurrenceLike {
  recurring: boolean;
  /** `occ_date`; null cuando la ocupación es recurrente. */
  occDate: string | null;
  /** Días en que se repite. 0 = domingo … 6 = sábado (0028_occupation_days.sql). */
  days: number[];
}

/**
 * FR-TIM-008: ¿esta ocupación aparece el día `dateISO`?
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN CADA VISTA
 * El predicado vivía copiado en tres archivos (`data/home.ts`, `time/page.tsx`
 * y `time/WeekView.tsx`) como `o.recurring || o.date === d`. Tres copias es
 * tres oportunidades de que una se quede atrás — y una ya se había quedado
 * atrás antes, el bug que arregló 0016_time_occupation_date.sql.
 *
 * `days` usa la convención de `Date.getUTCDay()`: 0 = domingo … 6 = sábado.
 * Por eso aquí NO hay conversión: es exactamente el número que devuelve el
 * reloj. Fue la razón de adoptar la columna tal como existía en producción en
 * vez de imponer ISO-8601 (1=lunes … 7=domingo), que habría obligado a
 * traducir en cada lectura y a convertir el dato ya capturado.
 */
export function occupationAppliesOn(occ: OccurrenceLike, dateISO: string): boolean {
  // Una ocupación con fecha concreta ignora `days`: pertenece a ese día y a
  // ningún otro. Solo la recurrente responde "¿qué días me toca?".
  if (!occ.recurring) return occ.occDate === dateISO;
  return occ.days.includes(new Date(`${dateISO}T00:00:00Z`).getUTCDay());
}

const DAY_LETTERS = ["D", "L", "M", "X", "J", "V", "S"]; // índice = getUTCDay()
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // se lee empezando en lunes

/**
 * Cómo se le dice al usuario en qué días se repite una ocupación. Los casos
 * frecuentes tienen nombre; el resto se deletrea en orden de lectura
 * (lunes primero), aunque el domingo valga 0.
 */
export function daysLabel(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "todos los días";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "entre semana";
  if (set.size === 2 && set.has(0) && set.has(6)) return "fin de semana";
  if (set.size === 0) return "ningún día";
  return DISPLAY_ORDER.filter((d) => set.has(d))
    .map((d) => DAY_LETTERS[d])
    .join("·");
}

export interface Slot {
  start: string;
  end: string;
  minutes: number;
}

/** FR-TIM-003: espacios disponibles = complemento de ocupaciones dentro del rango de actividad. */
export function availableSlots(window: ActivityWindow, occupations: OccupationLike[]): Slot[] {
  const startMin = timeToMin(window.start);
  const endMin = timeToMin(window.end);
  const occ = occupations
    .map((o) => ({ s: clamp(timeToMin(o.start), startMin, endMin), e: clamp(timeToMin(o.end), startMin, endMin) }))
    .filter((o) => o.e > o.s)
    .sort((a, b) => a.s - b.s);

  const merged: { s: number; e: number }[] = [];
  for (const o of occ) {
    const last = merged[merged.length - 1];
    if (last && o.s <= last.e) {
      last.e = Math.max(last.e, o.e);
    } else {
      merged.push({ ...o });
    }
  }

  const slots: Slot[] = [];
  let cursor = startMin;
  for (const o of merged) {
    if (o.s > cursor) slots.push({ start: minToTime(cursor), end: minToTime(o.s), minutes: o.s - cursor });
    cursor = Math.max(cursor, o.e);
  }
  if (cursor < endMin) slots.push({ start: minToTime(cursor), end: minToTime(endMin), minutes: endMin - cursor });
  return slots;
}

export function occupiedMinutes(window: ActivityWindow, occupations: OccupationLike[]): number {
  const startMin = timeToMin(window.start);
  const endMin = timeToMin(window.end);
  return occupations.reduce((s, o) => {
    const a = clamp(timeToMin(o.start), startMin, endMin);
    const b = clamp(timeToMin(o.end), startMin, endMin);
    return s + Math.max(0, b - a);
  }, 0);
}

export function capacityMinutes(window: ActivityWindow): number {
  return Math.max(0, timeToMin(window.end) - timeToMin(window.start));
}

export type SaturationLevel = "ok" | "warn" | "saturated";

export interface SaturationStatus {
  capMinutes: number;
  occupiedMinutes: number;
  taskMinutes: number;
  totalCommitted: number;
  pct: number;
  status: SaturationLevel;
  availableMinutes: number;
}

/**
 * BR-017: ocupaciones fuera del rango de actividad se registran pero no
 * participan en el cálculo de saturación (por eso se usa `occupiedMinutes`,
 * ya recortado al rango, no la suma cruda).
 */
export function saturationStatus(window: ActivityWindow, occupations: OccupationLike[], impactTaskMinutes: number): SaturationStatus {
  const cap = capacityMinutes(window);
  const occ = occupiedMinutes(window, occupations);
  const totalCommitted = occ + impactTaskMinutes;
  const pct = cap ? Math.round((totalCommitted / cap) * 100) : 0;
  const status: SaturationLevel = pct >= 100 ? "saturated" : pct >= 80 ? "warn" : "ok";
  return {
    capMinutes: cap,
    occupiedMinutes: occ,
    taskMinutes: impactTaskMinutes,
    totalCommitted,
    pct,
    status,
    availableMinutes: Math.max(0, cap - totalCommitted)
  };
}
