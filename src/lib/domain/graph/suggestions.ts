// src/lib/domain/graph/suggestions.ts
// De candidata de SQL a propuesta de arista — lógica pura.
//
// EL REPARTO QUE ORDENA ESTE ARCHIVO: SQL encuentra (`graph_detectar_de`), el
// modelo solo ELIGE entre índices de una lista que se le dio, y esto convierte
// la elección en algo que un botón puede ejecutar. El modelo nunca escribe un
// uuid: si devolviera uno, no habría dónde meterlo.

import { sanearPropuesta, type PropuestaSaneada } from "../coach/proposals.ts";
import type { Domain } from "../insights/types.ts";

export interface Candidato {
  patron: "sin_meta" | "posible_duplicado";
  sourceEntityId: string;
  sourceLabel: string;
  sourceTable: string;
  targetEntityId: string;
  targetLabel: string;
  targetTable: string;
  relType: "supports" | "duplicates";
  similitud: number | null;
}

export interface Item {
  entityId: string;
  label: string;
}

export interface Elegida {
  suelto: number;
  meta: number;
  porque: string;
}

/** Cuántas sugerencias de arista entran en la cola por mañana. Más sería ruido. */
export const MAX_ARISTAS_POR_DIA = 3;

const SIMETRICAS = new Set(["related_to", "duplicates"]);

/** La misma sugerencia da la misma huella; en las simétricas, en cualquier orden. */
export function huellaArista(rel: string, a: string, b: string): string {
  const [x, y] = SIMETRICAS.has(rel) && b < a ? [b, a] : [a, b];
  return `arista:${rel}:${x}:${y}`;
}

export function candidatosAutorizados(
  candidatos: readonly Candidato[],
  autorizados: readonly Domain[],
  dominioDeTabla: (tabla: string) => Domain | null
): Candidato[] {
  const ok = (tabla: string) => {
    const d = dominioDeTabla(tabla);
    return d !== null && autorizados.includes(d);
  };
  return candidatos.filter((c) => ok(c.sourceTable) && ok(c.targetTable));
}

export function agruparSinMeta(candidatos: readonly Candidato[]): { sueltos: Item[]; metas: Item[] } {
  const sueltos = new Map<string, Item>();
  const metas = new Map<string, Item>();
  for (const c of candidatos) {
    if (c.patron !== "sin_meta") continue;
    if (!sueltos.has(c.sourceEntityId)) sueltos.set(c.sourceEntityId, { entityId: c.sourceEntityId, label: c.sourceLabel });
    if (!metas.has(c.targetEntityId)) metas.set(c.targetEntityId, { entityId: c.targetEntityId, label: c.targetLabel });
  }
  return { sueltos: [...sueltos.values()], metas: [...metas.values()] };
}

/** Lo que devolvió el modelo, reducido a elecciones posibles. Nunca lanza. */
export function validarElegidas(bruto: unknown, nSueltos: number, nMetas: number, max = MAX_ARISTAS_POR_DIA): Elegida[] {
  const lista = (bruto as { elegidas?: unknown } | null)?.elegidas;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const salida: Elegida[] = [];
  for (const e of lista) {
    const { suelto, meta, porque } = (e ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(suelto) || !Number.isInteger(meta)) continue;
    const s = suelto as number;
    const m = meta as number;
    if (s < 0 || s >= nSueltos || m < 0 || m >= nMetas) continue;
    const clave = `${s}:${m}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ suelto: s, meta: m, porque: typeof porque === "string" ? porque.trim() : "" });
    if (salida.length >= max) break;
  }
  return salida;
}

export function propuestaDeArista(c: Candidato, porque: string): PropuestaSaneada | null {
  const titulo =
    c.relType === "duplicates"
      ? `¿«${c.sourceLabel}» y «${c.targetLabel}» son la misma tarea?`
      : `Conectar «${c.sourceLabel}» con la meta «${c.targetLabel}»`;
  return sanearPropuesta({
    tipo: "arista",
    titulo,
    detalle: porque,
    datos: JSON.stringify({ source: c.sourceEntityId, target: c.targetEntityId, rel: c.relType })
  });
}
