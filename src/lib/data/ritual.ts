import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { getUserTimeZone, todayForUser } from "@/lib/data/profile";
import { hourInTimeZone, timeInTimeZone } from "@/lib/domain/datetime.ts";
import { getHomeData } from "@/lib/data/home";
import { loadTodayBrief, loadIdentityOverview } from "@/lib/data/identity";
import { loadRoutinesForToday } from "@/lib/data/routines";
import { resolverAjustes, POLITICA_POR_DEFECTO, PREFERENCIA_POR_DEFECTO } from "@/lib/domain/ritual/policy.ts";
import { hechosDeContexto } from "@/lib/domain/ritual/contexto.ts";
import { esTipoPaso, type RitualSettings, type TipoPaso } from "@/lib/domain/ritual/types.ts";
import { esModoNavegacion, type ModoNavegacion } from "@/lib/domain/centro/apertura.ts";
import type { EntradaSecuencia } from "@/lib/domain/ritual/secuencia.ts";
import { quincenaFor } from "@/lib/domain/quincena.ts";
import { diffDays } from "@/lib/domain/datetime.ts";
import type { Frequency } from "@/lib/domain/development/routines.ts";

/**
 * La capa de lectura del arranque guiado (D-165). Dos funciones, y la diferencia
 * entre ellas es el motivo de que sean dos:
 *
 *  · `loadRitualGate()` es BARATA y la paga CADA carga de página, porque la
 *    puerta vive en el layout de `(app)`, que envuelve todas las pantallas. Es
 *    una sola RPC y, con la política apagada —el valor sembrado—, una lectura de
 *    una tabla de una fila.
 *  · `loadRitualContent()` es CARA y solo se llama cuando la puerta ya dijo que
 *    sí. Junta media aplicación.
 *
 * Aquí —y SOLO aquí— se traduce de las formas de Supabase a las del dominio. El
 * dominio no conoce `BriefView` ni las filas de `getHomeData` a propósito: eso
 * es lo que le permite correr también en el navegador cuando el overlay
 * recalcula la secuencia al llegar el brief tarde.
 */

function pasosDeArray(v: unknown): TipoPaso[] {
  return Array.isArray(v) ? v.filter((x): x is TipoPaso => typeof x === "string" && esTipoPaso(x)) : [];
}

export interface PuertaDelRitual {
  settings: RitualSettings;
  dateISO: string;
  hourLocal: number;
  /** Minutos desde medianoche, hora local del perfil. */
  ahoraMin: number;
  yaHayEjecucionHoy: boolean;
  nombre: string;
  /**
   * Cómo navega esta persona (D-166). Viaja en la misma RPC que todo lo demás:
   * con premium por defecto, leerlo aparte sería una segunda consulta en cada
   * carga de página de toda la aplicación.
   */
  navMode: ModoNavegacion;
}

/** «HH:MM[:SS]» → minutos desde medianoche. */
function aMinutos(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/**
 * El nombre con el que se saluda: el de pila. «Buenos días, Luis» y no «Buenos
 * días, Luis Vargas Sánchez» — el ritual habla como alguien que te conoce, no
 * como un formulario.
 */
function nombreDePila(nombre: string | null | undefined): string {
  return (nombre ?? "").trim().split(/\s+/)[0] || "";
}

/**
 * Política + preferencia + «¿ya se mostró hoy?», ya resueltas.
 *
 * NUNCA LANZA. Devuelve `null` si no hay sesión o si la consulta falla, y quien
 * llama trata eso como «no se muestra». Un error aquí reventaría el layout de la
 * aplicación entera: una feature opcional no puede tumbar la pantalla de nadie.
 */
export const loadRitualGate = cache(async (): Promise<PuertaDelRitual | null> => {
  try {
    const user = await getSessionUser();
    if (!user) return null;

    const supabase = await createClient();
    const [dateISO, timeZone] = await Promise.all([todayForUser(), getUserTimeZone()]);

    const [{ data, error }, { data: profile }] = await Promise.all([
      supabase.rpc("ritual_gate", { p_date: dateISO }).maybeSingle(),
      supabase.from("profiles").select("name").eq("user_id", user.id).maybeSingle()
    ]);
    if (error || !data) return null;

    const settings = resolverAjustes(
      {
        ...POLITICA_POR_DEFECTO,
        enabled: data.policy_enabled,
        steps: pasosDeArray(data.steps),
        windowStart: data.window_start,
        windowEnd: data.window_end,
        frequency: data.frequency as Frequency,
        aiEnabled: data.ai_enabled,
        blocking: data.blocking,
        maxRoutineSteps: data.max_routine_steps
      },
      {
        ...PREFERENCIA_POR_DEFECTO,
        enabled: data.pref_enabled,
        stepsOff: pasosDeArray(data.pref_steps_off),
        aiEnabled: data.pref_ai
      }
    );

    return {
      settings,
      dateISO,
      hourLocal: hourInTimeZone(timeZone),
      ahoraMin: aMinutos(timeInTimeZone(timeZone)),
      yaHayEjecucionHoy: data.run_exists,
      nombre: nombreDePila(profile?.name) || "Hola",
      // Un valor desconocido —una versión futura, una fila a mano— cae a
      // premium, que es el valor por defecto del producto.
      navMode: esModoNavegacion(data.pref_nav_mode) ? data.pref_nav_mode : "premium"
    };
  } catch {
    return null;
  }
});

/**
 * Las cifras que el lienzo convierte en tarjetas cuando aprietan (D-169). Solo
 * estas tres: el resto de lo que el centro enseñaba —destinos, atajos, la
 * rejilla— se fue con el menú.
 */
export interface SenalesDelDia {
  vencidas: number;
  diasParaFinDeQuincena: number;
  presupuestoEnRojo: boolean;
}

export interface ContenidoDelRitual extends EntradaSecuencia {
  /**
   * La identidad que la persona escribió, para el hueco del paso de afirmación
   * mientras el respaldo genera. NO es contenido generado: son sus palabras.
   */
  identidadDeclarada: string | null;
  /** Si el brief de hoy ya existe. Si no, el overlay pide el respaldo. */
  hayBriefDeHoy: boolean;
  /** Si el respaldo ya se intentó hoy: un intento por persona y día. */
  briefIntentadoHoy: boolean;
  /** Para la fila «Sigue por aquí». Sin IA: se deducen. */
  senales: SenalesDelDia;
}

/**
 * Todo lo que el ritual necesita pintar, en una pasada.
 *
 * No duplica una sola consulta: `getHomeData`, `loadTodayBrief`,
 * `loadRoutinesForToday` y `loadIdentityOverview` están envueltas en `cache()`
 * de React, así que lo que `/home` o `/development/routines` ya estén pidiendo
 * en este mismo request se reaprovecha.
 */
export const loadRitualContent = cache(async (puerta: PuertaDelRitual): Promise<ContenidoDelRitual | null> => {
  try {
    const user = await getSessionUser();
    if (!user) return null;

    const supabase = await createClient();
    const [home, brief, rutinas, identidad, { data: run }] = await Promise.all([
      getHomeData(user.id),
      loadTodayBrief(),
      loadRoutinesForToday(),
      loadIdentityOverview(),
      supabase
        .from("ritual_runs")
        .select("brief_attempted")
        .eq("user_id", user.id)
        .eq("local_date", puerta.dateISO)
        .maybeSingle()
    ]);

    const quincena = quincenaFor(puerta.dateISO);

    return {
      settings: puerta.settings,
      nombre: puerta.nombre,
      dateISO: puerta.dateISO,
      hourLocal: puerta.hourLocal,
      ahoraMin: puerta.ahoraMin,

      // `aiEnabled` decide qué se MUESTRA, no qué se genera: el brief ya está
      // escrito desde las 04:00. Apagarlo oculta los pasos de identidad.
      brief:
        puerta.settings.aiEnabled && brief
          ? {
              id: brief.id,
              affirmations: brief.affirmations.map((a) => ({ id: a.id, text: a.text, category: a.category })),
              mantra: brief.mantra,
              visualization: brief.visualization
                ? {
                    title: brief.visualization.title,
                    durationMin: brief.visualization.durationMin,
                    steps: brief.visualization.steps
                  }
                : null,
              dailyAction: brief.dailyAction ? { text: brief.dailyAction.text, done: brief.actionDone } : null
            }
          : null,

      rutinas: rutinas.rows.map((r) => ({
        id: r.routine.id,
        name: r.routine.name,
        due: r.due,
        active: r.routine.active,
        position: r.routine.position,
        // El bloque de Autogestión del Tiempo al que está anclada: es lo que deja
        // al dominio decidir si esta rutina toca AHORA o en otro momento del día.
        bloque: r.occ ? { inicioMin: aMinutos(r.occ.start_time), finMin: aMinutos(r.occ.end_time) } : null,
        habits: r.habits.map((h) => ({
          id: h.id,
          name: h.name,
          position: h.position,
          durationMin: h.durationMin,
          cue: h.cue,
          twoMinVersion: h.twoMinVersion,
          // CUALQUIER estado cuenta como registrado —hecho, omitido o
          // pospuesto—: la persona ya dijo algo sobre ese hábito hoy.
          registradoHoy: h.todayEntry !== null
        }))
      })),

      contexto: hechosDeContexto({
        liquidez: home.liquidity,
        presupuestoRestante: home.budgetRemaining,
        hayPresupuesto: home.hasBudget,
        vencidas: home.overdueCount,
        impacto: home.impactTasks.length,
        saturacionPct: home.saturation.pct,
        recordatoriosHoy: home.reminders.length
      }),

      plan: {
        // La «Única Cosa» del día, que es el campo que Home ya pinta arriba.
        oneThing: home.dailyPlan?.one_thing || null,
        tareas: home.impactTasks.map((t) => ({ id: t.id, title: t.title }))
      },

      senales: {
        vencidas: home.overdueCount,
        diasParaFinDeQuincena: diffDays(puerta.dateISO, quincena.toISO),
        presupuestoEnRojo: home.hasBudget && home.budgetRemaining <= 0
      },

      identidadDeclarada: identidad?.profile?.desiredIdentity || null,
      hayBriefDeHoy: brief !== null,
      briefIntentadoHoy: run?.brief_attempted ?? false
    };
  } catch {
    return null;
  }
});

/**
 * La política tal cual está guardada, para las dos pantallas de ajustes.
 *
 * Sin fila —que solo pasa si alguien la borró a mano— devuelve la de por
 * defecto, que está APAGADA: ninguna pantalla tiene que distinguir los dos
 * casos, y el resultado visible es el mismo.
 */
export const loadRitualPolicy = cache(async (): Promise<RitualSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("ritual_policy").select("*").maybeSingle();
  if (!data) return POLITICA_POR_DEFECTO;
  return {
    enabled: data.enabled,
    steps: pasosDeArray(data.steps),
    windowStart: data.window_start,
    windowEnd: data.window_end,
    frequency: data.frequency as Frequency,
    aiEnabled: data.ai_enabled,
    blocking: data.blocking,
    maxRoutineSteps: data.max_routine_steps
  };
});

/** La preferencia de quien mira, ya con los valores por defecto si no tiene fila. */
export const loadRitualPreference = cache(async () => {
  const user = await getSessionUser();
  if (!user) return PREFERENCIA_POR_DEFECTO;
  const supabase = await createClient();
  const { data } = await supabase.from("ritual_prefs").select("*").eq("user_id", user.id).maybeSingle();
  if (!data) return PREFERENCIA_POR_DEFECTO;
  return { enabled: data.enabled, stepsOff: pasosDeArray(data.steps_off), aiEnabled: data.ai_enabled };
});
