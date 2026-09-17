// src/lib/api/secreto.ts
import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * La comparación de un secreto de cabecera, en tiempo constante.
 *
 * Vivía dentro de `/api/push/dispatch` y sale aquí cuando aparece la segunda
 * ruta sin sesión (D-164). Es el tipo de función que NO conviene reescribir en
 * cada sitio: la comprobación de longitud previa no es un detalle de estilo
 * —`timingSafeEqual` LANZA si las longitudes no coinciden, en vez de devolver
 * falso—, y una copia que la olvide convierte un 401 en un 500 y, de paso, en
 * una excepción no capturada.
 */
export function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // `timingSafeEqual` exige la misma longitud, y comprobarla antes vuelve a
  // filtrar información — pero solo la longitud, que no es el secreto.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
