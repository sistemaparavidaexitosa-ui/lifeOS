// src/lib/domain/insights/nightly.ts
// Cuándo llamar al modelo en los insights nocturnos (probado en
// tests/domain/insights-nightly.test.ts).

export const JOB_INSIGHTS_HABITOS = "insights.habits";

/**
 * ¿Merece la pena llamar al modelo esta noche?
 *
 * No si no hay hechos (no hay nada que redactar) ni si los hechos son
 * exactamente los de la última ejecución: el análisis diría lo mismo, y
 * `recommendations` ya lo tiene. Cuando algo cambia —una racha nueva, un
 * patrón que aparece, una cifra que se mueve— la huella cambia y se llama.
 */
export function debeAnalizar(hechos: number, huellaHoy: string, huellaAnterior: string | null): "analizar" | "sin-hechos" | "sin-cambios" {
  if (hechos === 0) return "sin-hechos";
  if (huellaAnterior !== null && huellaAnterior === huellaHoy) return "sin-cambios";
  return "analizar";
}
