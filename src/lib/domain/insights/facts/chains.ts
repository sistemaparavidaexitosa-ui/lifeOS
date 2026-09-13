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
//
// POR QUÉ SE FUNDE POR (HECHO, META): un hecho como `execution.overdue` puede
// citar varias tareas a la vez, y el `label` del hecho nombra la situación, no
// una tarea en concreto. Antes, cada raíz producía SU cadena con el mismo
// `hecho.label`, así que la cadena de la tarea T2 —en el proyecto Q— se leía
// como si T1, la que de hecho nombra el `label`, viviera en Q. Ahora cada
// cadena nombra su propia raíz con `nombrarRaiz`, y las raíces que llegan al
// mismo hecho y a la misma meta se funden en UN hecho de cadena, no uno por
// raíz casi idéntico.

import { clampWeight, type Domain, type Fact } from "../types.ts";

export interface FilaCadena {
  rootEntityId: string;
  /** El nombre de la raíz, no el de un nodo intermedio. Ver `nombrarRaiz`. */
  rootLabel: string;
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

/** Cuántas raíces como mucho se nombran en el `label` de una cadena fundida. */
const MAX_RAICES_EN_LABEL = 3;

/** El nombre de una raíz, con SU propio camino — nunca el de otra raíz del mismo grupo. */
function nombrarRaiz(rootLabel: string, camino: readonly FilaCadena[]): string {
  const intermedios = camino.slice(0, -1).map((paso) => `«${paso.label}»`);
  return intermedios.length ? `«${rootLabel}» (vía ${intermedios.join(" → ")})` : `«${rootLabel}»`;
}

interface Alcance {
  hecho: Fact;
  domain: Domain;
  metaEntityId: string;
  metaLabel: string;
  raiz: string;
  rootLabel: string;
  camino: FilaCadena[];
  weight: number;
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

  const autorizado = (tabla: string) => {
    const d = dominioDeTabla(tabla);
    return d !== null && autorizados.includes(d) ? d : null;
  };

  // Un alcance por (raíz, meta) — TODAVÍA sin fundir. La fusión es el paso de
  // abajo, y depende de qué hecho sostiene cada raíz, así que primero hace
  // falta calcularlos todos.
  const alcances: Alcance[] = [];

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

      alcances.push({
        hecho,
        domain: dominioMeta,
        metaEntityId: meta.entityId,
        metaLabel: meta.label,
        raiz,
        rootLabel: meta.rootLabel,
        camino,
        weight: clampWeight(hecho.weight * DECAIMIENTO ** (meta.depth - 1))
      });
    }
  }

  // La fusión: mismo hecho y misma meta es UNA observación, aunque la citen
  // varias raíces. `hecho.id` y no el objeto, porque dos `Fact` con el mismo
  // id no deberían darse, pero comparar por valor es más barato que confiar
  // en identidad de referencia.
  const grupos = new Map<string, Alcance[]>();
  for (const a of alcances) {
    const clave = `${a.hecho.id}::${a.metaEntityId}`;
    const lista = grupos.get(clave) ?? [];
    lista.push(a);
    grupos.set(clave, lista);
  }

  const salida: Fact[] = [];
  for (const grupo of grupos.values()) {
    // Por si el mismo (raíz, meta) llegara dos veces — no debería, pero una
    // raíz repetida en el label sería peor que una cadena de menos.
    const porRaizUnica = new Map<string, Alcance>();
    for (const a of grupo) if (!porRaizUnica.has(a.raiz)) porRaizUnica.set(a.raiz, a);
    const items = [...porRaizUnica.values()];
    // `grupos` solo tiene entradas con al menos un `Alcance` (se crean al
    // empujar el primero), así que `items` nunca está vacío aquí.
    const primero = items[0];
    if (!primero) continue;

    const nombres = items.slice(0, MAX_RAICES_EN_LABEL).map((a) => nombrarRaiz(a.rootLabel, a.camino));
    const sujetos = nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}` : nombres[0];
    const sobran = items.length - MAX_RAICES_EN_LABEL;
    const extra = sobran > 0 ? ` y ${sobran} más` : "";
    const verbo = items.length > 1 ? "tocan" : "toca";

    const refsCrudas = [
      ...primero.hecho.refs.filter((r) => porRaizUnica.has(r.id)),
      ...items.flatMap((a) => a.camino.map((paso) => ({ table: paso.entityTable, id: paso.entityId })))
    ];
    // La meta y los intermedios compartidos aparecen en el camino de cada
    // raíz del grupo: sin este `Map`, saldrían tantas veces como raíces.
    const refs = [...new Map(refsCrudas.map((r) => [`${r.table}:${r.id}`, r])).values()];

    salida.push({
      id: `chain.${primero.metaEntityId}.${primero.hecho.id}`,
      domain: primero.domain,
      label: `${sujetos}${extra} (${primero.hecho.label}) ${verbo} la meta «${primero.metaLabel}».`,
      weight: Math.max(...items.map((a) => a.weight)),
      refs
    });
  }

  return salida.sort((a, b) => b.weight - a.weight).slice(0, MAX_CADENAS);
}
