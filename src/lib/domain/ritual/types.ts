// src/lib/domain/ritual/types.ts
// El vocabulario del arranque guiado (D-165).
//
// Sin React, sin Supabase y sin "server-only": lo importan el servidor, los
// componentes cliente y los tests. Que el dominio del ritual no dependa de
// nada del servidor no es higiene abstracta — es lo que permite que el overlay
// vuelva a llamar a `construirSecuencia()` EN EL NAVEGADOR cuando el brief
// llega tarde, en vez de pedir la pantalla entera otra vez.

import type { Frequency } from "../development/routines.ts";

/**
 * Los tipos de paso que el dominio sabe pintar, EN SU ORDEN NARRATIVO.
 *
 * Este array es la autoridad del orden. El administrador elige QUÉ pasos, no en
 * qué orden: la secuencia —saludo, identidad, rutina, contexto, plan— tiene una
 * sola respuesta buena, y una lista arrastrable en el panel sería mucha interfaz
 * para una decisión que no se toma.
 *
 * El mismo vocabulario está repetido en el `check` de `ritual_policy.steps`
 * (0068). No es duplicación ociosa: impide que una versión futura de la pantalla
 * cuele en la base un paso que nadie sabe dibujar.
 */
export const PASOS_RITUAL = [
  "greeting",
  "affirmation",
  "mantra",
  "visualization",
  "dailyAction",
  "routineStep",
  "context",
  "planToday",
  "closing"
] as const;

export type TipoPaso = (typeof PASOS_RITUAL)[number];

export function esTipoPaso(v: string): v is TipoPaso {
  return (PASOS_RITUAL as readonly string[]).includes(v);
}

/** Lo que decide el administrador, para todo el mundo. Espejo de `ritual_policy`. */
export interface RitualPolicy {
  enabled: boolean;
  steps: TipoPaso[];
  windowStart: number;
  windowEnd: number;
  /** Los MISMOS cuatro valores que `routines.frequency`: un solo calendario. */
  frequency: Frequency;
  aiEnabled: boolean;
  blocking: boolean;
  maxRoutineSteps: number;
}

/**
 * Lo que decide cada persona. Espejo de `ritual_prefs`.
 *
 * `stepsOff` y no `stepsOn`, y la diferencia es la regla entera: no existe forma
 * de nombrar un paso para encenderlo.
 */
export interface RitualPreference {
  enabled: boolean;
  stepsOff: TipoPaso[];
  aiEnabled: boolean;
}

/** Las dos cosas ya resueltas. Misma forma que la política, otro significado. */
export type RitualSettings = RitualPolicy;

/** Un dato del día que merece un hueco en pantalla. Sin formato: solo números. */
export interface HechoRitual {
  id: string;
  etiqueta: string;
  valor: number;
  unidad: "moneda" | "conteo" | "porcentaje" | "minutos";
  tono: "ok" | "warn" | "bad" | "info";
}

/** Un hábito visto desde el ritual. Lo mínimo para pintarlo y marcarlo. */
export interface HabitoDelPaso {
  id: string;
  name: string;
  durationMin: number;
  cue: string;
  twoMinVersion: string;
}

export type PasoRitual =
  | { kind: "greeting"; saludo: string; nombre: string; dateISO: string }
  | { kind: "affirmation"; items: { id: string; text: string; category: string | null }[] }
  | { kind: "mantra"; texto: string }
  | { kind: "visualization"; titulo: string; durationMin: number; steps: { text: string; seconds: number }[] }
  | { kind: "dailyAction"; briefId: string; texto: string; hecha: boolean }
  | { kind: "routineStep"; routineId: string; routineName: string; habit: HabitoDelPaso }
  | { kind: "context"; hechos: HechoRitual[] }
  | { kind: "planToday"; oneThing: string | null; tareas: { id: string; title: string }[] }
  | { kind: "closing"; frase: string };

/**
 * Cómo se llama cada paso en las pantallas de ajustes. Un solo mapa para el
 * panel de administración y para Configuración: si cada uno escribiera el suyo,
 * el administrador encendería «Afirmación» y la persona apagaría «Afirmaciones
 * del día» sin saber que son lo mismo.
 */
export const ETIQUETA_PASO: Record<TipoPaso, string> = {
  greeting: "Saludo",
  affirmation: "Afirmación del día",
  mantra: "Mantra",
  visualization: "Visualización guiada",
  dailyAction: "Acción del día",
  routineStep: "Hábitos pendientes de tus rutinas",
  context: "Contexto del día (tareas y dinero)",
  planToday: "Plan del día",
  closing: "Cierre: «¿Qué quieres hacer hoy?»"
};
