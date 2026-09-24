// src/lib/domain/centro/runtime/layout.ts
// El orden y la densidad (D-188). Puro, probado en
// tests/domain/centro-runtime-generador.test.ts.
//
// NO REORDENA. El orden es del generador: si el layout también opinara, habría
// dos sitios decidiendo qué va primero y ninguno sería responsable. Aquí solo se
// decide lo que el generador no sabe —cuánto aire cabe— con una regla que se
// lee en una línea.

import type { FlagsDelRuntime } from "./flags.ts";
import type { Screen } from "./types.ts";

/** Más de seis secciones ya no respiran a pantalla de teléfono. */
export const MAX_AIREADA = 6;

export function aplicarLayout(screen: Screen, flags: FlagsDelRuntime): Screen {
  if (flags.layoutEngine) {
    // AGENTIC_LAYOUT_ENGINE: aquí entrará el motor (columnas en escritorio,
    // secciones que el aprendizaje sabe que se ignoran). En Fase 1 no hace
    // nada, y la prueba «Con el motor encendido, Fase 1 hace lo mismo» lo fija.
  }

  return {
    ...screen,
    layout: { densidad: screen.sections.length > MAX_AIREADA ? "compacta" : "aireada" },
    sections: [...screen.sections]
  };
}
