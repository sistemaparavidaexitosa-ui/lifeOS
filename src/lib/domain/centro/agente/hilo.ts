// src/lib/domain/centro/agente/hilo.ts
// El hilo de la conversación del Centro (D-194). Puro.
//
// Vive en el cliente y no se guarda (decisión del usuario: mismo cerebro que el
// chat, hilo propio). Al modelo solo le viaja el TEXTO de los últimos turnos:
// los bloques ya se pintaron y reenviarlos llenaría el prompt con datos que el
// modelo puede volver a leer si los necesita.

import type { AnySection } from "../runtime/types.ts";

export const MAX_HISTORIAL = 12;

export interface Turno {
  id: string;
  rol: "persona" | "agente";
  texto: string;
  secciones: AnySection[];
}

export function agregar(hilo: readonly Turno[], turno: Turno): Turno[] {
  return [...hilo, turno];
}

export function historialParaModelo(hilo: readonly Turno[]): { rol: "persona" | "agente"; texto: string }[] {
  return hilo
    .filter((t) => t.texto.trim() !== "")
    .slice(-MAX_HISTORIAL)
    .map((t) => ({ rol: t.rol, texto: t.texto }));
}
