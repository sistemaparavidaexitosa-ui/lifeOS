// src/lib/domain/ai/tools.ts
// Las reglas que se le aplican a lo que PIDE el modelo cuando usa una
// herramienta. Puro, sin Supabase: lo impuro vive en `src/lib/ai/tools.ts`.
//
// Los argumentos de una llamada a herramienta son texto generado por un
// modelo, no un formulario validado. Aquí no se confía en ninguno.

import { MAX_FILAS_CONSULTA } from "../../insights/context.ts";
import { addDaysISO } from "../datetime.ts";

/**
 * Ventana máxima que se puede pedir de una vez.
 *
 * Poco más de un año: cubre «compáralo con el año pasado», que es la pregunta
 * más ancha que alguien hace de verdad, y deja fuera el «tráete todo» que
 * llenaría el prompt con filas que nadie va a leer.
 */
export const MAX_DIAS_CONSULTA = 400;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Una fecha ISO que además EXISTE: `2026-13-45` cumple el patrón y no es un día. */
function esFecha(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export type Ventana = { ok: true; desde: string; hastaExclusivo: string } | { ok: false; reason: string };

/**
 * La ventana de fechas de una consulta, saneada.
 *
 * **El final es EXCLUSIVO**, y no es un detalle de estilo: las columnas de la
 * lista blanca son unas `date` y otras `timestamptz`. Un `lte` contra un
 * `timestamptz` compara con la medianoche del día pedido y se deja fuera el
 * día entero; con un final exclusivo y `lt`, las dos clases de columna se
 * comportan igual.
 *
 * Una ventana desmedida se RECORTA en vez de rechazarse: el modelo pidiendo
 * diez años no es un error del usuario, y contestarle «no» cuando se le puede
 * dar el último año útil solo gasta otra ronda.
 */
export function ventanaConsulta(desde: string, hasta: string, hoy: string): Ventana {
  if (!esFecha(desde) || !esFecha(hasta)) {
    return { ok: false, reason: "Las fechas deben ir en formato AAAA-MM-DD." };
  }
  if (desde > hasta) {
    // Devolver vacío en silencio haría que el modelo concluyera «no hay nada»,
    // que es una respuesta falsa. Mejor decirle que preguntó mal.
    return { ok: false, reason: "La fecha inicial es posterior a la final." };
  }

  // Nada del futuro: no hay datos ahí y pedirlos solo ensancha la ventana.
  const fin = hasta > hoy ? hoy : hasta;
  const hastaExclusivo = addDaysISO(fin, 1);
  const minimo = addDaysISO(hastaExclusivo, -MAX_DIAS_CONSULTA);
  return { ok: true, desde: desde < minimo ? minimo : desde, hastaExclusivo };
}

/**
 * Cuántas filas se devuelven. Un valor ausente o absurdo cae en el tope, que
 * no es rendimiento: lo que vuelve viaja DENTRO del prompt de la llamada
 * siguiente y se come la ventana y la cuota.
 */
export function limiteConsulta(pedido: number | undefined): number {
  if (typeof pedido !== "number" || !Number.isFinite(pedido) || pedido <= 0) return MAX_FILAS_CONSULTA;
  return Math.min(Math.floor(pedido), MAX_FILAS_CONSULTA);
}

/**
 * El id con el que una fila entra al contexto.
 *
 * Lleva la tabla dentro porque el modelo la va a CITAR, y una cita que no se
 * puede seguir hasta la fila que la sostiene no es una cita. Es la misma idea
 * que los `refs` de un `Fact`.
 */
export function idDeFila(tabla: string, id: string): string {
  return `fila:${tabla}:${id}`;
}
