// src/lib/domain/insights/states.ts
// Los siete estados de una recomendación (§5.1) y qué transiciones son legales.
//
// Puro y probado porque es la máquina que decide qué puede hacer el usuario con
// cada tarjeta de la bandeja, y porque dos de los estados —Suppressed y
// Reported— cambian lo que el motor ve en el siguiente análisis.

export type RecommendationStatus =
  | "Presented"
  | "Accepted"
  | "Applied"
  | "Edited"
  | "Dismissed"
  | "Suppressed"
  | "Reported";

export const ALL_STATUSES: RecommendationStatus[] = [
  "Presented",
  "Accepted",
  "Applied",
  "Edited",
  "Dismissed",
  "Suppressed",
  "Reported"
];

/** Las que siguen esperando una decisión del usuario. */
export const LIVE_STATUSES: RecommendationStatus[] = ["Presented", "Edited"];

/**
 * Las que vuelven a entrar como contexto del siguiente análisis para que el
 * motor deje de repetirse (§5.1). No entrena nada: solo lee su propio
 * historial de rechazos.
 */
export const REJECTION_STATUSES: RecommendationStatus[] = ["Suppressed", "Reported"];

export const STATUS_LABEL: Record<RecommendationStatus, string> = {
  Presented: "Sin revisar",
  Accepted: "Aceptada",
  Applied: "Aplicada",
  Edited: "Editada",
  Dismissed: "Descartada",
  Suppressed: "Silenciada",
  Reported: "Reportada"
};

/**
 * Transiciones legales. Dos criterios:
 *
 *  - `Applied` solo se alcanza ejecutando una acción, y las acciones llegan en
 *    la Fase 4. Hasta entonces es un estado válido que nada produce; se declara
 *    aquí para no tener que tocar la máquina cuando llegue.
 *  - `Dismissed` no es terminal: descartar es "esta vez no". Si las cifras
 *    cambian, el motor puede volver a plantearlo. Silenciar sí es definitivo
 *    desde la bandeja — para eso está.
 */
const TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
  Presented: ["Accepted", "Edited", "Dismissed", "Suppressed", "Reported"],
  Edited: ["Accepted", "Applied", "Dismissed", "Suppressed", "Reported"],
  Accepted: ["Applied", "Dismissed", "Suppressed"],
  Applied: [],
  Dismissed: ["Suppressed", "Reported"],
  Suppressed: ["Dismissed"],
  Reported: []
};

export function canTransition(from: RecommendationStatus, to: RecommendationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: RecommendationStatus): RecommendationStatus[] {
  return TRANSITIONS[from];
}

/** ¿Vuelve a entrar como rechazo en el contexto del próximo análisis? */
export function feedsRejectionContext(status: RecommendationStatus): boolean {
  return REJECTION_STATUSES.includes(status);
}
