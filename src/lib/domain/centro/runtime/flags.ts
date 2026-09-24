// src/lib/domain/centro/runtime/flags.ts
// Los interruptores del runtime del Centro (D-191). Puro, probado en
// tests/domain/centro-runtime-catalogo.test.ts.
//
// VARIABLES DE ENTORNO, NO UNA TABLA. Es como se encienden el coach y los
// insights del Kernel (`coachPorElKernel()` en config/env.ts), y una persona
// sola no necesita un panel de flags. Apagar es borrar y redesplegar.
//
// LOS SECUNDARIOS DEPENDEN DEL PRIMERO. Generar pantallas, mover el layout o
// reordenar la navegación sin runtime no significa nada; se resuelve aquí una
// vez para que nadie tenga que acordarse de comprobar los dos.
//
// El cliente NO lee variables: recibe este objeto ya resuelto en la respuesta de
// `/api/centro`. Un `NEXT_PUBLIC_*` podría decir una cosa y el servidor otra.

export interface FlagsDelRuntime {
  /** AGENTIC_CENTER_RUNTIME: el Centro pinta pantallas del runtime. */
  runtime: boolean;
  /** AGENTIC_GENERATED_SCREENS: lo escrito en la barra pide pantalla. Fase 1: no-op. */
  pantallasGeneradas: boolean;
  /** AGENTIC_LAYOUT_ENGINE: el layout deja el orden fijo. Fase 1: no-op. */
  layoutEngine: boolean;
  /** AGENTIC_DYNAMIC_NAVIGATION: las acciones reordenan la navegación. Fase 1: no-op. */
  navegacionDinamica: boolean;
}

export const FLAGS_APAGADOS: Readonly<FlagsDelRuntime> = Object.freeze({
  runtime: false,
  pantallasGeneradas: false,
  layoutEngine: false,
  navegacionDinamica: false
});

/** «1» y nada más, como los del Kernel. «true» no enciende: dos grafías serían dos verdades. */
const encendido = (v: string | undefined): boolean => v?.trim() === "1";

export function resolverFlags(env: Record<string, string | undefined>): FlagsDelRuntime {
  if (!encendido(env.AGENTIC_CENTER_RUNTIME)) return { ...FLAGS_APAGADOS };
  return {
    runtime: true,
    pantallasGeneradas: encendido(env.AGENTIC_GENERATED_SCREENS),
    layoutEngine: encendido(env.AGENTIC_LAYOUT_ENGINE),
    navegacionDinamica: encendido(env.AGENTIC_DYNAMIC_NAVIGATION)
  };
}
