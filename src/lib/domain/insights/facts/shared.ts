// src/lib/domain/insights/facts/shared.ts
// Lo que todos los extractores de hechos necesitan y ninguno debe reescribir.
//
// `slug`, `round2` y `nextDay` nacieron privados dentro de facts/money.ts. Al
// llegar el segundo extractor la elección era copiarlos o subirlos aquí, y en
// este repo esa pregunta ya tiene respuesta: el predicado `occupationAppliesOn`
// vivió copiado en tres archivos y una de las copias se quedó atrás — es el bug
// que arregló la migración 0016. Un slug que difiera entre dominios rompería
// algo más silencioso todavía: los ids de los hechos, que son justo lo que la
// validación de anclaje compara.

import { addDaysISO } from "../../datetime.ts";

/** `Alimentos` → `alimentos`; `Casa y hogar` → `casa-y-hogar`. Para ids estables. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * El día siguiente, para usarlo como límite superior EXCLUSIVO de un rango y
 * que "hasta hoy" incluya hoy. Es un `< nextDay(hoy)` en vez de un `<= hoy`
 * porque las comparaciones de fecha del motor son de cadena ISO.
 */
export function nextDay(iso: string): string {
  return addDaysISO(iso, 1);
}

/**
 * Minutos que se traslapan dos rangos `HH:MM`. Cero si no se tocan.
 * Vive aquí, y no en domain/time.ts, porque solo el motor pregunta esto: las
 * pantallas de tiempo dibujan el traslape, no lo miden.
 */
export function overlapMinutes(a: { start: string; end: string }, b: { start: string; end: string }): number {
  const min = (t: string) => {
    const [h, m] = t.split(":");
    return Number(h ?? 0) * 60 + Number(m ?? 0);
  };
  return Math.max(0, Math.min(min(a.end), min(b.end)) - Math.max(min(a.start), min(b.start)));
}

/** `3` → `3 días`; `1` → `1 día`. Los hechos se leen tal cual en el prompt. */
export function days(n: number): string {
  return n === 1 ? "1 día" : `${n} días`;
}
