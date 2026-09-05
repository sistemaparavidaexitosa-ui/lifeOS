import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePushDispatchSecret } from "@/config/env";
import { notifySystem } from "@/lib/push/notify";
import { DEFAULT_TIMEZONE, isValidTimeZone, timeInTimeZone, todayInTimeZone } from "@/lib/domain/datetime.ts";
import {
  recordatoriosQueTocan,
  resumenDeVencimientos,
  type ReminderPendiente,
  type TareaConVencimiento
} from "@/lib/domain/push/schedule.ts";

export const dynamic = "force-dynamic";
/** Un minuto de techo: el trabajo va por lotes y no debe acercarse al límite. */
export const maxDuration = 60;

/**
 * EL RELOJ. Lo llama pg_cron cada cinco minutos (migración 0051).
 *
 * Corre SIN SESIÓN —quien invoca es la base de datos, no un navegador—, así
 * que lo único que lo protege es `PUSH_DISPATCH_SECRET`. Por eso el middleware
 * lo deja pasar explícitamente, junto a /api/health.
 *
 * Hace tres cosas, todas idempotentes gracias al UNIQUE de `dedupe_key`:
 *   1. recordatorios cuya hora ya pasó,
 *   2. el resumen diario de vencimientos, a la hora local de cada quien,
 *   3. reintentar los avisos que se quedaron sin salir.
 *
 * Nunca lanza hacia fuera: devuelve el recuento de lo que hizo. Si un usuario
 * falla, los demás siguen — un perfil con la zona horaria rota no puede dejar
 * al resto sin avisos.
 */

/** Tope por pasada. Con cinco minutos entre ejecuciones, sobra. */
const LOTE = 200;
/** Más allá de esto, la suscripción no es que esté ocupada: es que no funciona. */
const MAX_INTENTOS = 3;

export async function POST(request: Request) {
  let esperado: string;
  try {
    esperado = requirePushDispatchSecret();
  } catch {
    // Sin secreto configurado la ruta no existe a efectos prácticos. 503 y no
    // 500: no está rota, está apagada.
    return NextResponse.json({ ok: false, reason: "Despachador no configurado" }, { status: 503 });
  }

  if (!secretoValido(request.headers.get("x-push-secret"), esperado)) {
    return NextResponse.json({ ok: false, reason: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const ahora = new Date();

  const recordatorios = await despacharRecordatorios(supabase, ahora);
  const vencimientos = await despacharVencimientos(supabase, ahora);
  const reintentos = await reintentarPendientes(supabase);

  // «creados» y «entregados» se cuentan aparte a propósito: sin ningún
  // dispositivo suscrito se crean avisos que no se entregan, y mezclarlo
  // haría parecer que el reloj no hizo nada.
  return NextResponse.json({ ok: true, recordatorios, vencimientos, entregados: reintentos });
}

/**
 * Comparación en tiempo constante. Con `===` el tiempo de respuesta filtra
 * cuántos caracteres iniciales acertó quien prueba, y eso convierte un secreto
 * largo en uno que se adivina byte a byte.
 */
function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // `timingSafeEqual` exige la misma longitud, y comprobarla antes vuelve a
  // filtrar información — pero solo la longitud, que no es el secreto.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Admin = ReturnType<typeof createAdminClient>;

/** Zona y hora del resumen de cada usuario, en una sola consulta. */
async function preferencias(supabase: Admin, userIds: string[]) {
  const [{ data: perfiles }, { data: prefs }] = await Promise.all([
    supabase.from("profiles").select("user_id, timezone").in("user_id", userIds),
    supabase.from("notification_prefs").select("*").in("user_id", userIds)
  ]);

  const zonaPorUsuario = new Map(
    (perfiles ?? []).map((p) => [
      p.user_id,
      p.timezone && isValidTimeZone(p.timezone) ? p.timezone : DEFAULT_TIMEZONE
    ])
  );
  const prefsPorUsuario = new Map((prefs ?? []).map((p) => [p.user_id, p]));

  return { zonaPorUsuario, prefsPorUsuario };
}

async function despacharRecordatorios(supabase: Admin, ahora: Date): Promise<number> {
  // `remind_on <= hoy+1` en UTC y no la fecha exacta: alguien en Asia ya puede
  // estar en el día siguiente respecto al servidor, y filtrar por el hoy de
  // Vercel le escondería su propio recordatorio de esta mañana.
  const limite = todayInTimeZone("UTC", new Date(ahora.getTime() + 86_400_000));

  const { data: filas } = await supabase
    .from("reminders")
    .select("id, user_id, subject_type, subject_id, text, remind_on, remind_at")
    .eq("done", false)
    .is("notified_at", null)
    .lte("remind_on", limite)
    .order("remind_on", { ascending: true })
    .limit(LOTE);

  if (!filas?.length) return 0;

  const userIds = [...new Set(filas.map((f) => f.user_id))];
  const { zonaPorUsuario, prefsPorUsuario } = await preferencias(supabase, userIds);

  let enviados = 0;

  for (const userId of userIds) {
    const prefs = prefsPorUsuario.get(userId);
    // Sin fila de preferencias = todo encendido (0049).
    if (prefs && !prefs.reminders) continue;

    const zona = zonaPorUsuario.get(userId) ?? DEFAULT_TIMEZONE;
    const pendientes: ReminderPendiente[] = filas
      .filter((f) => f.user_id === userId)
      .map((f) => ({
        id: f.id,
        subjectType: f.subject_type as "task" | "comment",
        subjectId: f.subject_id,
        text: f.text,
        remindOnISO: f.remind_on,
        remindAt: f.remind_at
      }));

    const tocan = recordatoriosQueTocan(pendientes, {
      todayISO: todayInTimeZone(zona, ahora),
      horaLocal: timeInTimeZone(zona, ahora),
      digestHour: prefs?.digest_hour ?? 8
    });

    for (const r of tocan) {
      await notifySystem({
        userId,
        kind: "reminder",
        title: "Recordatorio",
        body: r.text || "Tenías algo apuntado para ahora.",
        // Un recordatorio sobre un comentario lleva a su hilo; sobre una tarea,
        // a la tarea. El sujeto no tiene FK (0038) porque apunta a dos tablas.
        href: r.subjectType === "task" ? `/execution?task=${r.subjectId}` : "/home",
        dedupeKey: `reminder:${r.id}`
      });

      // Se marca SIEMPRE, aunque el push no saliera: el aviso ya está en la
      // bandeja y la campana lo enseña. Reintentar el envío es trabajo de
      // `reintentarPendientes`, no de volver a evaluar el recordatorio.
      await supabase.from("reminders").update({ notified_at: new Date().toISOString() }).eq("id", r.id);
      enviados++;
    }
  }

  return enviados;
}

async function despacharVencimientos(supabase: Admin, ahora: Date): Promise<number> {
  // Solo quienes tienen algo asignado POR ID. Las asignaciones antiguas que se
  // quedaron sin `user_id` en el backfill de 0050 no avisan: es preferible el
  // silencio a avisar a quien se llame parecido.
  const { data: asignaciones } = await supabase
    .from("task_assignees")
    .select("user_id, tasks!inner(id, title, due, status)")
    .not("user_id", "is", null)
    .not("tasks.due", "is", null)
    .not("tasks.status", "in", "(Completed,Cancelled)")
    .limit(2000);

  if (!asignaciones?.length) return 0;

  type Fila = { user_id: string | null; tasks: { id: string; title: string; due: string | null } | null };
  const porUsuario = new Map<string, TareaConVencimiento[]>();
  for (const fila of asignaciones as unknown as Fila[]) {
    if (!fila.user_id || !fila.tasks?.due) continue;
    const lista = porUsuario.get(fila.user_id) ?? [];
    lista.push({ id: fila.tasks.id, title: fila.tasks.title, dueISO: fila.tasks.due });
    porUsuario.set(fila.user_id, lista);
  }

  const userIds = [...porUsuario.keys()];
  if (!userIds.length) return 0;
  const { zonaPorUsuario, prefsPorUsuario } = await preferencias(supabase, userIds);

  let enviados = 0;

  for (const [userId, tareas] of porUsuario) {
    const prefs = prefsPorUsuario.get(userId);
    if (prefs && !prefs.due_digest) continue;

    const zona = zonaPorUsuario.get(userId) ?? DEFAULT_TIMEZONE;
    const digestHour = prefs?.digest_hour ?? 8;
    const horaLocal = timeInTimeZone(zona, ahora);

    // Una vez al día, a partir de su hora. El `dedupe_key` con la fecha local
    // es lo que impide que las pasadas siguientes repitan el aviso.
    if (Number(horaLocal.slice(0, 2)) < digestHour) continue;

    const hoy = todayInTimeZone(zona, ahora);
    const resumen = resumenDeVencimientos(tareas, hoy);
    if (!resumen) continue;

    const ok = await notifySystem({
      userId,
      kind: "task.due",
      title: resumen.title,
      body: resumen.body,
      href: "/execution",
      dedupeKey: `due:${hoy}`
    });
    if (ok) enviados++;
  }

  return enviados;
}

/**
 * Avisos que quedaron en la bandeja sin salir: el teléfono estaba sin red, o
 * el servicio de push devolvió un 5xx. Se reintentan unas pocas veces y se
 * dejan estar — el aviso sigue en la campana, que es lo que importa.
 */
async function reintentarPendientes(supabase: Admin): Promise<number> {
  const { data: filas } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, href, dedupe_key, delivery_attempts")
    .is("delivered_at", null)
    .lt("delivery_attempts", MAX_INTENTOS)
    .order("created_at", { ascending: true })
    .limit(LOTE);

  if (!filas?.length) return 0;

  const { sendPush } = await import("@/lib/push/send");
  let entregados = 0;

  for (const n of filas) {
    const resultado = await sendPush(n.user_id, {
      title: n.title,
      body: n.body,
      href: n.href,
      dedupeKey: n.dedupe_key
    });

    await supabase
      .from("notifications")
      .update({
        delivered_at: resultado.sent > 0 ? new Date().toISOString() : null,
        delivery_attempts: n.delivery_attempts + 1
      })
      .eq("id", n.id);

    if (resultado.sent > 0) entregados++;
  }

  return entregados;
}
