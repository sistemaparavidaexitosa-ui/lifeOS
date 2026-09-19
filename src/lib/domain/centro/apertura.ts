// src/lib/domain/centro/apertura.ts
// Cuándo se abre solo el centro premium (D-166). Puro, probado en
// tests/domain/centro-apertura.test.ts.

export type ModoNavegacion = "premium" | "habitual";

export function esModoNavegacion(v: unknown): v is ModoNavegacion {
  return v === "premium" || v === "habitual";
}

/**
 * Las rutas que cuentan como «entrar por la puerta de casa». La raíz redirige
 * siempre a `/home` (src/app/page.tsx), así que abrir la aplicación a secas
 * también cuenta.
 */
const ENTRADAS = ["/", "/home"];

function esEntrada(ruta: string): boolean {
  // Se normaliza la barra final: `/home/` es la misma pantalla que `/home`, y
  // una diferencia de un carácter no puede decidir si el centro aparece.
  const limpia = ruta.length > 1 && ruta.endsWith("/") ? ruta.slice(0, -1) : ruta;
  return ENTRADAS.includes(limpia);
}

export interface EntradaApertura {
  modo: ModoNavegacion;
  /** Es el principio de una visita: pestaña nueva, o la PWA recién abierta. */
  inicioDeVisita: boolean;
  ruta: string;
}

/**
 * Tres condiciones, y las tres importan:
 *
 *  · el MODO, porque quien eligió la navegación habitual no quiere el centro;
 *  · el INICIO DE VISITA, porque volver a Home navegando no es abrir la app, y
 *    taparle la pantalla a quien está trabajando es lo contrario de ayudar;
 *  · la RUTA, porque un enlace directo —una notificación que abre una tarea— se
 *    pidió para ver esa tarea, no para ver el centro.
 *
 * En cualquier otro caso el centro sigue estando a un clic, en su botón.
 */
export function debeAbrirseElCentro(e: EntradaApertura): boolean {
  return e.modo === "premium" && e.inicioDeVisita && esEntrada(e.ruta);
}
