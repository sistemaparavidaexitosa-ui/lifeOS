// src/lib/domain/push/schedule.ts
//
// QUÉ TOCA AVISAR AHORA. Lógica pura: ni red, ni base, ni React.
//
// El "ahora" entra siempre como parámetro y en la zona horaria del perfil
// (D-016/D-018). Es la misma regla que `todayLocal` y `dueReminders`: con un
// `new Date()` aquí dentro, el recordatorio de las nueve de la mañana de quien
// vive al oeste del servidor sonaría de madrugada.

export interface ReminderPendiente {
  id: string;
  subjectType: "task" | "comment";
  subjectId: string;
  text: string;
  /** `reminders.remind_on`, la fecha (0038). */
  remindOnISO: string;
  /** `reminders.remind_at`, «HH:MM». NULL = «ese día», sin hora propia (0051). */
  remindAt: string | null;
}

export interface Ahora {
  todayISO: string;
  /** Hora local en «HH:MM». */
  horaLocal: string;
  /** Hora del resumen diario del usuario: la que se usa para los que no tienen hora. */
  digestHour: number;
}

/**
 * Los recordatorios que ya deberían haber sonado y todavía no lo han hecho.
 *
 * Se comparan pares (fecha, hora) como texto, que con ISO y «HH:MM» ordena
 * igual que cronológicamente y no necesita construir ninguna fecha. Construir
 * un `Date` aquí sería reintroducir la zona horaria del servidor por la puerta
 * de atrás.
 *
 * INCLUYE LOS ATRASADOS. Es la promesa que ya hacía `dueReminders` en 0038: uno
 * que se quedó atrás porque no abriste la app el martes no puede desaparecer en
 * silencio, que es exactamente lo que un recordatorio promete no hacer.
 */
export function recordatoriosQueTocan(pendientes: readonly ReminderPendiente[], ahora: Ahora): ReminderPendiente[] {
  const horaPorDefecto = `${String(ahora.digestHour).padStart(2, "0")}:00`;

  return pendientes
    .filter((r) => {
      const hora = (r.remindAt ?? horaPorDefecto).slice(0, 5);
      if (r.remindOnISO < ahora.todayISO) return true; // atrasado: suena ya
      if (r.remindOnISO > ahora.todayISO) return false; // futuro
      return hora <= ahora.horaLocal;
    })
    .sort((a, b) => {
      if (a.remindOnISO !== b.remindOnISO) return a.remindOnISO.localeCompare(b.remindOnISO);
      const ha = (a.remindAt ?? horaPorDefecto).slice(0, 5);
      const hb = (b.remindAt ?? horaPorDefecto).slice(0, 5);
      return ha === hb ? a.id.localeCompare(b.id) : ha.localeCompare(hb);
    });
}

export interface TareaConVencimiento {
  id: string;
  title: string;
  /** `tasks.due`. */
  dueISO: string;
}

export interface Resumen {
  title: string;
  body: string;
}

/**
 * UN solo aviso con todo lo que vence, no uno por tarea.
 *
 * Diez tareas vencidas son diez vibraciones seguidas y un teléfono que se
 * silencia para siempre. El resumen distingue «vence hoy» de «se te pasó»
 * porque son dos cosas distintas: una es una agenda y la otra una deuda.
 *
 * Devuelve `null` cuando no hay nada. Avisar de que no hay nada que hacer es
 * la forma más rápida de que alguien apague las notificaciones.
 */
export function resumenDeVencimientos(
  tareas: readonly TareaConVencimiento[],
  todayISO: string
): Resumen | null {
  const hoy = tareas.filter((t) => t.dueISO === todayISO);
  const atrasadas = tareas.filter((t) => t.dueISO < todayISO);
  const total = hoy.length + atrasadas.length;
  if (total === 0) return null;

  // Con una sola, el nombre dice más que el número: «vence "Llamar al banco"»
  // se entiende sin abrir nada, y «1 tarea vence hoy» obliga a mirar.
  const unica = total === 1 ? (hoy[0] ?? atrasadas[0]) : undefined;
  if (unica) {
    return {
      title: hoy.length === 1 ? "Vence hoy" : "Se te pasó una tarea",
      body: `«${unica.title}»`
    };
  }

  const partes: string[] = [];
  if (hoy.length) partes.push(`${hoy.length} ${hoy.length === 1 ? "vence" : "vencen"} hoy`);
  if (atrasadas.length) partes.push(`${atrasadas.length} ${atrasadas.length === 1 ? "atrasada" : "atrasadas"}`);

  return { title: `${total} tareas te esperan`, body: partes.join(" · ") };
}
