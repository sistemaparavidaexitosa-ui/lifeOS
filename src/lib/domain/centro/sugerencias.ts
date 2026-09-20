// src/lib/domain/centro/sugerencias.ts
// El filtro entre lo que el modelo dice y lo que se guarda (D-167). Puro,
// probado en tests/domain/centro-sugerencias.test.ts.

import { NAV_ITEMS } from "../../../components/nav-items.ts";
import { sanearPropuesta, type PropuestaCruda, type PropuestaSaneada } from "../coach/proposals.ts";

/** Tres. El centro es una puerta, no una bandeja de entrada. */
export const MAX_SUGERENCIAS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ¿Ese destino existe de verdad?
 *
 * Es la diferencia entre una sugerencia y un enlace roto que el modelo se
 * imaginó. Tres reglas, y cada una cierra una forma distinta de equivocarse:
 *
 *  1. **Solo rutas internas.** Nada que empiece por `http`, por `//` o por
 *     `javascript:`. Una IA que puede escribir una dirección externa en un
 *     botón de tu aplicación es una IA que puede sacarte de ella.
 *  2. **Solo rutas del menú, y no las ocultas.** Si una pantalla no se ofrece en
 *     la barra lateral, tampoco se ofrece aquí.
 *  3. **Solo proyectos tuyos.** El `?project=` tiene que ser un uuid que esté en
 *     tu lista. La RLS lo impediría igualmente al abrirlo, pero entonces el
 *     botón ya estaría pintado y el fallo sería una pantalla vacía.
 */
export function destinoValido(href: string, proyectos: { id: string }[]): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;

  const [ruta = "", query] = href.split("?");
  const item = NAV_ITEMS.find((n) => n.href === ruta);
  if (!item || item.hidden) return false;

  if (!query) return true;
  const id = new URLSearchParams(query).get("project");
  if (!id) return false;
  return UUID.test(id) && proyectos.some((p) => p.id === id);
}

export interface ContextoDeSaneado {
  proyectos: { id: string }[];
  /** Títulos ya propuestos hoy: no se repite lo que ya está en la lista. */
  yaPropuestas: string[];
}

/**
 * De lo que devolvió el modelo a lo que se puede guardar.
 *
 * Se apoya en `sanearPropuesta`, que ya existe y ya no se fía del prompt, y le
 * añade lo que es propio del centro: el destino tiene que existir, y no se
 * repite algo que la persona ya tiene delante. Repetir es la forma más rápida
 * de que alguien deje de leer las sugerencias.
 */
export function sanearSugerencias(crudas: PropuestaCruda[], ctx: ContextoDeSaneado): PropuestaSaneada[] {
  const vistos = new Set(ctx.yaPropuestas.map((t) => t.trim().toLowerCase()));
  const salida: PropuestaSaneada[] = [];

  for (const cruda of crudas) {
    if (salida.length >= MAX_SUGERENCIAS) break;

    const sana = sanearPropuesta(cruda);
    if (!sana) continue;
    if (sana.tipo === "foco" && !destinoValido(sana.payload.href ?? "", ctx.proyectos)) continue;

    const clave = sana.titulo.trim().toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(sana);
  }

  return salida;
}
