// src/lib/domain/ai/graph-tool.ts
// Lo que la herramienta `explorar_grafo` le enseña al modelo — lógica pura.
//
// Mismas reglas que `consultar`: cada cosa lleva un id citable, y lo que el
// usuario no autorizó no viaja. El id es `fila:<tabla>:<uuid>` a propósito: un
// proyecto que llega por el grafo y el mismo proyecto que llega por `consultar`
// son UNA cosa para el anclaje, no dos.

import { idDeFila } from "./tools.ts";
import type { Domain } from "../insights/types.ts";

export interface NodoCrudo {
  entityTable: string;
  entityId: string;
  nodeType: string;
  label: string;
  relacion?: string | null;
  profundidad: number;
}

export interface NodoParaModelo {
  id: string;
  tipo: string;
  etiqueta: string;
  relacion?: string;
  profundidad: number;
}

export const MAX_NODOS_HERRAMIENTA = 30;

export function nodosParaModelo(
  nodos: readonly NodoCrudo[],
  autorizados: readonly Domain[],
  dominioDeTabla: (tabla: string) => Domain | null,
  max = MAX_NODOS_HERRAMIENTA
): NodoParaModelo[] {
  const mejores = new Map<string, NodoCrudo>();
  for (const n of nodos) {
    const dominio = dominioDeTabla(n.entityTable);
    if (dominio === null || !autorizados.includes(dominio)) continue;
    const previo = mejores.get(n.entityId);
    if (!previo || n.profundidad < previo.profundidad) mejores.set(n.entityId, n);
  }

  return [...mejores.values()]
    .sort((a, b) => a.profundidad - b.profundidad)
    .slice(0, max)
    .map((n) => ({
      id: idDeFila(n.entityTable, n.entityId),
      tipo: n.nodeType,
      etiqueta: n.label,
      ...(n.relacion ? { relacion: n.relacion } : {}),
      profundidad: n.profundidad
    }));
}
