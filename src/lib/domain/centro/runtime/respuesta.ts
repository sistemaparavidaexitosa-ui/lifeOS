// src/lib/domain/centro/runtime/respuesta.ts
// La forma de la respuesta de `/api/centro` (D-191). Pura, probada en
// tests/domain/centro-runtime-respuesta.test.ts con la prueba «FLAG APAGADO = HOY».
//
// POR QUÉ UNA FUNCIÓN PARA UN OBJETO. Es la promesa de todo el runtime: con el
// flag apagado, el Centro es el de ayer. La ruta importa Next y Supabase y no se
// puede probar con el runner de node; esta función sí, y es la única que decide
// qué campos salen.

import type { FlagsDelRuntime } from "./flags.ts";
import type { Screen } from "./types.ts";

export function respuestaDelCentro<B extends object>(base: B, flags: FlagsDelRuntime, screen: Screen | null) {
  if (!flags.runtime) return { ok: true as const, ...base };
  return { ok: true as const, ...base, screen, flags };
}
