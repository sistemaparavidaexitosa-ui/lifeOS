// src/lib/domain/centro/destinos.ts
// A dónde se puede ir desde el centro (D-166). Puro, probado en
// tests/domain/centro-destinos.test.ts.

/** Lo que el centro necesita de una entrada del menú. Espejo de `NavItem`. */
export interface DestinoLike {
  href: string;
  label: string;
  group: string;
  hidden?: boolean;
}

export interface GrupoDeDestinos {
  grupo: string;
  destinos: { href: string; label: string }[];
}

/**
 * Fuera de la lista, y cada uno por su motivo:
 *  · `/home` ES el centro; ofrecerse a sí mismo sería un espejo.
 *  · `/settings` baja al pie, junto a «Navegación habitual»: se va ahí a
 *    ajustar, no a trabajar.
 */
const FUERA = ["/home", "/settings"];

/**
 * Agrupa los destinos como la barra lateral, CONSERVANDO SU ORDEN.
 *
 * Se alimenta de `NAV_ITEMS`, la misma lista del menú, y no de una copia: una
 * segunda lista se queda atrás a la primera pantalla nueva que alguien añada, y
 * el fallo —un módulo al que no se puede llegar desde el centro— es de los que
 * nadie nota hasta que lo busca.
 *
 * Un grupo que se queda sin destinos no aparece: un titular sin nada debajo se
 * lee como un error de carga.
 */
export function destinosDelCentro(items: DestinoLike[]): GrupoDeDestinos[] {
  const grupos: GrupoDeDestinos[] = [];
  for (const item of items) {
    if (item.hidden || FUERA.includes(item.href)) continue;
    let grupo = grupos.find((g) => g.grupo === item.group);
    if (!grupo) {
      grupo = { grupo: item.group, destinos: [] };
      grupos.push(grupo);
    }
    grupo.destinos.push({ href: item.href, label: item.label });
  }
  return grupos;
}
