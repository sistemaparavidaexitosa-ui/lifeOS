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

export interface EntradaVistaInicial {
  /** Hay `datos` del arranque en `RitualHost`: el overlay se iba a mostrar. */
  hayArranque: boolean;
  abrirCentro: boolean;
  /** AGENTIC_CENTER_RUNTIME (D-194): con esto encendido, el Centro es el agente. */
  agente: boolean;
}

/**
 * Qué pinta `RitualHost` al montar (T3, «el Centro abre con tu rutina»).
 *
 * Con el agente encendido, un arranque que se iba a mostrar YA NO abre el
 * overlay viejo: abre el Centro, que empieza por la rutina de hoy
 * (`matutino`). Con el agente apagado nada cambia — es el camino de siempre,
 * y por eso esta función existe sola y no como un `if` más dentro del
 * componente: que el flag-off quede intacto se puede leer aquí sin levantar
 * React.
 */
export function vistaInicial(e: EntradaVistaInicial): "ritual" | "centro" | null {
  if (e.hayArranque) return e.agente ? "centro" : "ritual";
  return e.abrirCentro ? "centro" : null;
}

export interface EntradaMatutinoInicial {
  hayArranque: boolean;
  agente: boolean;
}

/**
 * Si el PRIMER Centro que se monta en esta sesión debe empezar por la rutina
 * (T3, corrección de revisión).
 *
 * SOLO EL VALOR INICIAL. `matutino` es cierto una única vez —el Centro que
 * reemplazó al arranque de la mañana— y `RitualHost` lo apaga (con
 * `onMatutinoRegistrado`) en cuanto ese primer `CentroAgente` lo registra:
 * cerrar y volver a abrir con el botón, o con el evento de abrir el centro,
 * monta otro `CentroAgente` que YA NO debe volver a llamar `startRitual` — si
 * lo hiciera, cada reapertura añadiría una fila más a `audit_log` por algo que
 * ya se marcó «visto hoy» una sola vez.
 */
export function matutinoInicial(e: EntradaMatutinoInicial): boolean {
  return e.hayArranque && e.agente;
}
