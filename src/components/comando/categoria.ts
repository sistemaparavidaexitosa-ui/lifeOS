// src/components/comando/categoria.ts
// Cómo se ve cada categoría (D-176).
//
// Vive en `components/` y no en `domain/comando/tipos.ts` porque es
// presentación: el tono de un chip y la clave de un icono no son vocabulario
// del problema, son decisiones de pantalla. Tenerlo en el dominio habría
// obligado a `domain/` a importar `components/icons.tsx`, invirtiendo las capas
// —cosa que no hace ningún otro archivo de `domain/`—.
//
// Los `Record<Categoria, …>` hacen que añadir una octava categoría rompa la
// compilación aquí hasta que alguien decida cómo se ve. Es lo que se quiere:
// una categoría sin icono se pintaría en blanco y nadie lo notaría en revisión.

import type { Categoria } from "@/lib/domain/comando/tipos.ts";
import type { NavIconKey } from "@/components/icons";

/**
 * El tono de cada chip, con los valores que ya acepta `Chip` en `ui.tsx`.
 *
 * Reutilizar su vocabulario en vez de inventar clases nuevas es lo que hace que
 * los chips del centro se vean como los del resto de la aplicación sin escribir
 * un CSS paralelo que se quedaría desincronizado al primer cambio de tema.
 */
export const TONO: Record<Categoria, "ok" | "warn" | "bad" | "info" | "accent" | "purple" | ""> = {
  bloquear: "bad",
  ejecutar: "accent",
  decidir: "purple",
  revisar: "warn",
  recordar: "info",
  delegar: "info",
  investigar: ""
};

/**
 * El micro-icono de cada categoría, de `NAV_ICONS`.
 *
 * Se reutilizan los iconos de navegación a propósito: son los que la persona ya
 * asocia a cada parte de la aplicación —el tablero, las metas, la memoria— y un
 * juego nuevo solo para el centro sería un segundo idioma visual que aprender
 * para no decir nada distinto.
 */
export const ICONO: Record<Categoria, NavIconKey> = {
  bloquear: "eisenhower",
  ejecutar: "board",
  decidir: "goals",
  revisar: "reports",
  recordar: "memory",
  delegar: "workspaces",
  investigar: "insights"
};
