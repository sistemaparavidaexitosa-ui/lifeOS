// src/lib/domain/centro/agente/hilo.ts
// El hilo de la conversación del Centro (D-194). Puro.
//
// Vive en el cliente y no se guarda (decisión del usuario: mismo cerebro que el
// chat, hilo propio). Al modelo solo le viaja el TEXTO de los últimos turnos:
// los bloques ya se pintaron y reenviarlos llenaría el prompt con datos que el
// modelo puede volver a leer si los necesita.

import type { AnySection } from "../runtime/types.ts";

export const MAX_HISTORIAL = 12;

/** Lo que `/api/centro/turno` acepta por entrada del historial. Tienen que coincidir. */
export const MAX_TEXTO_HISTORIAL = 2000;

export interface Turno {
  id: string;
  rol: "persona" | "agente";
  texto: string;
  secciones: AnySection[];
}

export function agregar(hilo: readonly Turno[], turno: Turno): Turno[] {
  return [...hilo, turno];
}

/**
 * El texto de un turno, con lo que el Centro entendió (D-204) al final: si no
 * viaja, «Sí, sigue» pierde la única frase que ancla qué va a seguir, y el
 * modelo puede releer la petición original como si aún estuviera sin aclarar.
 * Puede ser la ÚNICA razón por la que el turno viaja (un turno de
 * `confirmar_entendimiento` puro no trae más texto que ese).
 */
function conEntendimiento(t: Turno): string {
  const confirmacion = t.secciones.find((s) => s.kind === "confirmarEntendimiento");
  if (!confirmacion) return t.texto;
  const sufijo = `(Entendí: ${confirmacion.data.entendi})`;
  if (!t.texto.trim()) return sufijo;
  // Se recorta el texto, nunca lo entendido: la ruta del turno rechaza la
  // petición ENTERA si una entrada del historial pasa del tope, y la
  // conversación se quedaría atascada hasta que ese turno saliera de la ventana.
  return `${t.texto.slice(0, MAX_TEXTO_HISTORIAL - sufijo.length - 1)}\n${sufijo}`;
}

export function historialParaModelo(hilo: readonly Turno[]): { rol: "persona" | "agente"; texto: string }[] {
  return hilo
    .map((t) => ({ rol: t.rol, texto: conEntendimiento(t) }))
    .filter((t) => t.texto.trim() !== "")
    .slice(-MAX_HISTORIAL);
}
