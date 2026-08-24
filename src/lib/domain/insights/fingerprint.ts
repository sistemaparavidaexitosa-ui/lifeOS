// src/lib/domain/insights/fingerprint.ts
// Deduplicación de recomendaciones (§5.2).
//
// Con disparo bajo demanda el usuario puede analizar varias veces seguidas. Sin
// esto, cada análisis reescribe lo mismo y la bandeja se convierte en un eco.
// La huella identifica la MISMA recomendación entre análisis para refrescarla
// en vez de duplicarla.

import { createHash } from "node:crypto";

/**
 * `type` + los factId citados, ordenados y hasheados.
 *
 * El orden importa que NO importe: el modelo puede citar los mismos hechos en
 * distinto orden en dos corridas, y eso no la vuelve otra recomendación. Se
 * ordenan y se deduplican antes de hashear.
 *
 * El tipo se normaliza (minúsculas, sin espacios de sobra) porque lo escribe el
 * modelo y "Presupuesto" y "presupuesto" son lo mismo.
 */
export function recommendationFingerprint(type: string, factIds: string[]): string {
  const normalizedType = type.trim().toLowerCase();
  const normalizedFacts = [...new Set(factIds.map((id) => id.trim()))].sort();
  const payload = `${normalizedType}|${normalizedFacts.join(",")}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
