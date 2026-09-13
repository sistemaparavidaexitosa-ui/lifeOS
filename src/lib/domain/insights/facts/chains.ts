// src/lib/domain/insights/facts/chains.ts
// Los hechos de cadena — lógica pura: sin Supabase, sin red, sin `new Date()`.
//
// Un hecho suelto dice «esta tarea está atrasada». Una cadena dice «esta tarea
// atrasada pertenece a Abrir la tienda, que apoya la meta Ser independiente».
// Es la primera vez que el grafo le cuenta algo a la IA, y lo cuenta en forma
// de hecho: con id estable y `refs`, así que el anclaje sigue funcionando igual.
//
// LA REGLA DE PRIVACIDAD DE ESTE ARCHIVO: una cadena atraviesa tablas de varios
// dominios, y sale solo si TODOS están autorizados. Una tabla sin dominio en la
// lista blanca corta la cadena: no se adivina.

import { clampWeight, type Domain, type Fact } from "../types.ts";

export interface FilaCadena {
  rootEntityId: string;
  nodeId: string;
  parentId: string | null;
  viaRel: string;
  depth: number;
  label: string;
  nodeType: string;
  entityTable: string;
  entityId: string;
}

/** Tipos de nodo que cierran una cadena: lo que alguien quiere lograr. */
export const TIPOS_META: readonly string[] = ["goal", "financial_goal"];

/** Cuántas cadenas viajan como mucho. Son hechos caros de leer para el modelo. */
export const MAX_CADENAS = 8;

/** Cuántas entidades se recorren como mucho por pasada. */
export const MAX_RAICES = 40;

/** Lo que pesa de menos cada salto: una meta a tres saltos importa menos que a uno. */
const DECAIMIENTO = 0.85;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los uuids que sustentan los hechos más pesados, sin repetir. Son las raíces del recorrido. */
export function raicesDeHechos(facts: readonly Fact[], max = MAX_RAICES): string[] {
  const ordenados = [...facts].sort((a, b) => b.weight - a.weight);
  const vistos = new Set<string>();
  for (const f of ordenados) {
    for (const ref of f.refs) {
      if (UUID.test(ref.id) && !vistos.has(ref.id)) {
        vistos.add(ref.id);
        if (vistos.size >= max) return [...vistos];
      }
    }
  }
  return [...vistos];
}

export interface EntradaCadenas {
  facts: readonly Fact[];
  filas: readonly FilaCadena[];
  autorizados: readonly Domain[];
  dominioDeTabla: (tabla: string) => Domain | null;
}

export function chainFacts(entrada: EntradaCadenas): Fact[] {
  const { facts, filas, autorizados, dominioDeTabla } = entrada;

  // Qué hecho sostiene cada raíz: el de más peso que la cite.
  const hechoDeRaiz = new Map<string, Fact>();
  for (const f of facts) {
    for (const ref of f.refs) {
      const previo = hechoDeRaiz.get(ref.id);
      if (!previo || previo.weight < f.weight) hechoDeRaiz.set(ref.id, f);
    }
  }

  // Por raíz, cada nodo con su fila de menor profundidad.
  const porRaiz = new Map<string, Map<string, FilaCadena>>();
  for (const fila of filas) {
    const nodos = porRaiz.get(fila.rootEntityId) ?? new Map<string, FilaCadena>();
    const previa = nodos.get(fila.nodeId);
    if (!previa || fila.depth < previa.depth) nodos.set(fila.nodeId, fila);
    porRaiz.set(fila.rootEntityId, nodos);
  }

  const salida: Fact[] = [];
  const autorizado = (tabla: string) => {
    const d = dominioDeTabla(tabla);
    return d !== null && autorizados.includes(d) ? d : null;
  };

  for (const [raiz, nodos] of porRaiz) {
    const hecho = hechoDeRaiz.get(raiz);
    if (!hecho || !autorizados.includes(hecho.domain)) continue;

    for (const meta of nodos.values()) {
      if (!TIPOS_META.includes(meta.nodeType)) continue;

      // El camino, de la raíz hacia la meta.
      const camino: FilaCadena[] = [];
      let actual: FilaCadena | undefined = meta;
      while (actual && camino.length <= meta.depth) {
        camino.unshift(actual);
        actual = actual.parentId ? nodos.get(actual.parentId) : undefined;
      }

      const dominioMeta = autorizado(meta.entityTable);
      if (!dominioMeta || camino.some((paso) => autorizado(paso.entityTable) === null)) continue;

      const intermedios = camino.slice(0, -1).map((paso) => `«${paso.label}»`);
      const via = intermedios.length ? ` a través de ${intermedios.join(" → ")}` : " directamente";

      salida.push({
        id: `chain.${meta.entityId}.${raiz}`,
        domain: dominioMeta,
        label: `${hecho.label} — y eso toca la meta «${meta.label}»${via}.`,
        weight: clampWeight(hecho.weight * DECAIMIENTO ** (meta.depth - 1)),
        refs: [
          ...hecho.refs.filter((r) => r.id === raiz),
          ...camino.map((paso) => ({ table: paso.entityTable, id: paso.entityId }))
        ]
      });
    }
  }

  return salida.sort((a, b) => b.weight - a.weight).slice(0, MAX_CADENAS);
}
