// src/components/comando/categoria.ts
// Cómo se ve cada categoría en el Centro (D-176).
//
// Vive en `components/` y no en `domain/comando/tipos.ts` porque es
// presentación: la clave de un icono no es vocabulario
// del problema, son decisiones de pantalla. Tenerlo en el dominio habría
// obligado a `domain/` a importar `components/icons.tsx`, invirtiendo las capas
// —cosa que no hace ningún otro archivo de `domain/`—.
//
// Los `Record<Categoria, …>` hacen que añadir una octava categoría rompa la
// compilación aquí hasta que alguien decida cómo se ve. Es lo que se quiere:
// una categoría sin icono se pintaría en blanco y nadie lo notaría en revisión.

import type { Carril } from "@/lib/domain/comando/tipos.ts";
import type { NavIconKey } from "@/components/icons";

/**
 * El micro-icono de cada frente del Centro, de `NAV_ICONS`.
 *
 * Se reutilizan los iconos de navegación a propósito: son los que la persona ya
 * asocia a cada parte de la aplicación —el tablero, las metas, la memoria— y un
 * juego nuevo solo para el centro sería un segundo idioma visual que aprender
 * para no decir nada distinto.
 */
export const ICONO_CARRIL: Record<Carril, NavIconKey> = {
  execution: "board",
  development: "habits",
  money: "money"
};
