// src/lib/domain/insights/types.ts
// Intelligence OS — el tipo que atraviesa todo el motor.
//
// Un `Fact` es algo que YA se calculó de forma determinista a partir de los
// datos del usuario. El modelo nunca calcula: recibe hechos, los prioriza, los
// conecta entre dominios y los redacta. Por eso no puede inventar una cifra —
// no hay ninguna que inventar, solo que citar.

export type Domain = "money" | "execution" | "time" | "habits" | "debt" | "activity" | "nutrition";

export interface Fact {
  /**
   * Estable y determinista, del estilo `budget.overrun.alimentos`. Que sea
   * estable es lo que permite que la recomendación lo cite y que la validación
   * de anclaje pueda comprobar la cita contra el contexto que se envió.
   */
  id: string;
  domain: Domain;
  /** Legible tal cual, con las cifras ya formateadas por quien lo produce. */
  label: string;
  /** 0-1, qué tan anómalo. Ordena el recorte de contexto: los altos sobreviven. */
  weight: number;
  /** Filas reales que lo sustentan. Sirve para auditar de dónde salió cada hecho. */
  refs: { table: string; id: string }[];
}

/** Acota a 0-1 sin sorpresas: NaN y ±Infinity caen en los extremos. */
export function clampWeight(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Cómo se llama cada dominio en español. Vive aquí, junto al tipo, porque lo
 * leen las dos orillas: la casilla de opt-in en Configuración y el mensaje que
 * explica por qué un análisis no salió. Tenerlo dos veces es tenerlo mal una.
 */
export const DOMAIN_LABEL: Record<Domain, string> = {
  money: "Dinero",
  debt: "Deudas",
  habits: "Hábitos",
  time: "Tiempo",
  execution: "Proyectos y tareas",
  activity: "Actividad del equipo",
  nutrition: "Nutrición"
};
