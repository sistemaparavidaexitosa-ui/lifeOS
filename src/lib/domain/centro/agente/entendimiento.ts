// src/lib/domain/centro/agente/entendimiento.ts
// Del bloque «¿entendí bien?» a su sección (D-204). Puro, probado en
// tests/domain/centro-agente-entendimiento.test.ts.
import type { AnySection } from "../runtime/types.ts";

export function seccionDeConfirmacion(
  b: { entendi: string; seguir: string; alternativas: { etiqueta: string; texto: string | null }[] },
  id: string
): AnySection {
  return { id, kind: "confirmarEntendimiento", data: { entendi: b.entendi, seguir: b.seguir, alternativas: b.alternativas } };
}
