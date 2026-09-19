// src/lib/domain/ritual/policy.ts
// La regla dura del arranque guiado (D-165), probada en
// tests/domain/ritual-policy.test.ts.

import { PASOS_RITUAL, esTipoPaso, type RitualPolicy, type RitualPreference, type RitualSettings, type TipoPaso } from "./types.ts";

/**
 * La misma fila que siembra la migración 0068, en TypeScript.
 *
 * APAGADA, y el default importa: es lo que hace que desplegar la feature no le
 * cambie la mañana a nadie. Si algún día alguien la pone en `true` "para
 * probar", media base de usuarios se encuentra un overlay sin que nadie lo
 * decidiera — por eso hay un test que lo fija.
 */
export const POLITICA_POR_DEFECTO: RitualPolicy = {
  enabled: false,
  steps: ["greeting", "affirmation", "routineStep", "context", "planToday"],
  windowStart: 4,
  windowEnd: 12,
  frequency: "Diario",
  aiEnabled: true,
  blocking: true,
  maxRoutineSteps: 6
};

/** Lo que significa NO tener fila en `ritual_prefs`: todo lo que la política permita. */
export const PREFERENCIA_POR_DEFECTO: RitualPreference = {
  enabled: true,
  stepsOff: [],
  aiEnabled: true
};

/**
 * Política ∧ preferencia.
 *
 * > El usuario puede apagar lo que el administrador encendió. NUNCA al revés.
 *
 * Es una CONJUNCIÓN MONÓTONA, y serlo es lo que la hace demostrable con una
 * prueba de propiedad sobre una matriz de combinaciones en vez de con una lista
 * de casos que siempre deja uno fuera:
 *
 *     enabled   = p.enabled   ∧ f.enabled
 *     aiEnabled = p.aiEnabled ∧ f.aiEnabled
 *     steps     = p.steps \ f.stepsOff        ⊆ p.steps
 *
 * La otra mitad de la garantía está en la FORMA de la tabla: `ritual_prefs`
 * tiene `steps_off`, no `steps_on`. Aquí no hay nada que sumar porque allí no
 * hay nada que nombrar.
 *
 * Los pasos desconocidos se descartan al resolver, y no es paranoia: una fila
 * escrita por una versión futura de la pantalla puede traer una etiqueta que
 * este código no sabe dibujar, y un paso fantasma en la secuencia es una
 * pantalla en blanco a mitad del ritual.
 */
export function resolverAjustes(policy: RitualPolicy, pref: RitualPreference): RitualSettings {
  const apagados = new Set<string>(pref.stepsOff);
  return {
    ...policy,
    enabled: policy.enabled && pref.enabled,
    aiEnabled: policy.aiEnabled && pref.aiEnabled,
    steps: policy.steps.filter((paso) => esTipoPaso(paso) && !apagados.has(paso))
  };
}

/**
 * Lo que la pantalla de Configuración puede ENSEÑAR: lo que la política ofrece,
 * ni un paso más, y siempre en el orden narrativo.
 *
 * Que ordene aquí y no en la pantalla es deliberado: el administrador puede
 * haber guardado el array en cualquier orden, y una lista de ajustes que cambia
 * de orden entre visitas se lee como un error.
 *
 * Un interruptor que no puede encender nada es una promesa rota, así que lo que
 * no está aquí no se pinta.
 */
export function pasosOfrecibles(policy: RitualPolicy): TipoPaso[] {
  const ofrecidos = new Set<string>(policy.steps);
  return PASOS_RITUAL.filter((paso) => ofrecidos.has(paso));
}
