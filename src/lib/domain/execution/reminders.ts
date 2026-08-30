// src/lib/domain/execution/reminders.ts
// Recordatorios — lógica pura, sin React ni Supabase (probada en
// tests/domain/execution-reminders.test.ts).
//
// No hay ningún proceso que despierte a nadie: un recordatorio es una fila con
// una FECHA que Home mira cada día. Por eso todo aquí gira en torno a comparar
// fechas ISO, y el "hoy" entra como parámetro en la zona del perfil
// (D-016/D-018) — con `new Date()` dentro, el recordatorio de esta tarde
// aparecería mañana para quien viva al oeste del servidor.

import { addDaysISO } from "../datetime.ts";

export type ReminderPreset = "manana" | "en-3-dias" | "proxima-semana";

export interface ReminderLike {
  id: string;
  subjectType: "task" | "comment";
  subjectId: string;
  text: string;
  remindOnISO: string;
  done: boolean;
}

/**
 * Los atajos que ofrece la interfaz. Tres, no siete: la gracia de un
 * recordatorio rápido es no tener que pensar la fecha.
 *
 * «Próxima semana» es dentro de 7 días y no «el lunes que viene». Un lunes
 * fijo amontona en un solo día todo lo que se aplaza durante la semana, y
 * además obliga a decidir qué pasa cuando hoy YA es lunes.
 */
export const PRESET_DAYS: Record<ReminderPreset, number> = {
  manana: 1,
  "en-3-dias": 3,
  "proxima-semana": 7
};

export const PRESET_LABEL: Record<ReminderPreset, string> = {
  manana: "Mañana",
  "en-3-dias": "En 3 días",
  "proxima-semana": "La próxima semana"
};

export function presetDate(preset: ReminderPreset, todayISO: string): string {
  return addDaysISO(todayISO, PRESET_DAYS[preset]);
}

/**
 * Los que toca mostrar hoy: pendientes y con fecha ya cumplida.
 *
 * Se incluyen los VENCIDOS, no solo los de hoy exacto. Un recordatorio que se
 * quedó atrás porque no abriste la app el martes no debe desaparecer en
 * silencio: eso es exactamente lo que un recordatorio promete no hacer.
 */
export function dueReminders(reminders: readonly ReminderLike[], todayISO: string): ReminderLike[] {
  return reminders
    .filter((r) => !r.done && r.remindOnISO <= todayISO)
    .sort((a, b) => (a.remindOnISO === b.remindOnISO ? a.id.localeCompare(b.id) : a.remindOnISO.localeCompare(b.remindOnISO)));
}

/** Cuántos días lleva esperando. Cero si es de hoy; negativo no ocurre en `dueReminders`. */
export function overdueDays(reminder: ReminderLike, todayISO: string): number {
  const a = Date.parse(`${reminder.remindOnISO}T00:00:00Z`);
  const b = Date.parse(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
