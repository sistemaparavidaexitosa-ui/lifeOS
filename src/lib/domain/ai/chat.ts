// src/lib/domain/ai/chat.ts
import { MEMORY_SCOPES, type MemoryScope } from "../insights/memory.ts";

// El chat de IA transversal — lógica pura, sin React ni Supabase (probada en
// tests/domain/ai-chat.test.ts).
//
// Lo que vive aquí son las dos reglas que no se pueden delegar al modelo: qué
// parte de la conversación se le manda, y qué se acepta de lo que propone.

/** Un turno guardado, en la forma que interesa fuera de la base. */
export interface ChatMessageLike {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** ISO con hora. */
  createdAt: string;
}

/**
 * Cuántos turnos previos viajan al modelo.
 *
 * No es el historial que se PINTA —ese es todo— sino el que se manda. Un chat
 * de meses no cabe en ninguna ventana, y aunque cupiera, cada turno viejo es
 * contexto que compite con los hechos por la atención del modelo. Doce turnos
 * son seis idas y vueltas: suficiente para que «y eso último» siga
 * significando algo.
 */
export const MAX_TURNOS = 12;

/**
 * La ventana que se le manda al modelo, del más antiguo al más reciente.
 *
 * SIEMPRE EMPIEZA EN UN TURNO DE USUARIO, y esa es toda la sutileza. Cortar
 * por el número justo puede dejar arriba una respuesta suelta del asistente:
 * el modelo leería su propia frase como si alguien se la hubiera dicho, y
 * arrancaría contestando a media conversación. Si el corte cae en una
 * respuesta, se descarta y la ventana empieza una línea más abajo.
 */
export function recortarHistorial(mensajes: readonly ChatMessageLike[], max = MAX_TURNOS): ChatMessageLike[] {
  const ventana = max <= 0 ? [] : mensajes.slice(-max);
  const primero = ventana.findIndex((m) => m.role === "user");
  return primero <= 0 ? (primero === 0 ? ventana : []) : ventana.slice(primero);
}

/** Tope de una tarea propuesta. Un título más largo que esto es un párrafo. */
export const MAX_TITULO_TAREA = 120;

/**
 * Detecta una fecha escrita dentro del título. Mismo criterio —y por el mismo
 * motivo— que `sanitizePlan` en domain/execution/ai-plan.ts: una fecha
 * inventada por el modelo deja el tablero lleno de tareas vencidas al mes
 * siguiente. La tarea se crea igual; lo que se quita es la fecha.
 */
const FECHA_FUENTE = String.raw`\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(/\d{2,4})?)\b`;

/** Con `g`, para `replace`: quita TODAS las fechas del título, no solo la primera. */
const FECHA = new RegExp(FECHA_FUENTE, "g");

/**
 * Sin `g`, para `test`. No es duplicación: `RegExp.test` sobre un patrón global
 * avanza `lastIndex` y NO lo reinicia cuando acierta, así que la segunda
 * llamada seguida con el mismo texto devuelve `false`. Compartir el objeto
 * habría hecho que una memoria con fecha se colara una de cada dos veces.
 */
const CONTIENE_FECHA = new RegExp(FECHA_FUENTE);

/**
 * Lo que se acepta de una tarea propuesta por el modelo, o `null` si no hay
 * nada que proponer.
 *
 * Devolver `null` es una respuesta válida y la más frecuente: la mayoría de
 * los turnos son preguntas, no encargos. Un botón «Crear» sobre un título
 * vacío o de dos letras sería peor que no ofrecerlo.
 */
export function sanitizeProposedTask(title: string | null | undefined): string | null {
  if (!title) return null;

  const limpio = title
    .replace(FECHA, "")
    .replace(/\s+/g, " ")
    .trim()
    // Una coma o un guion sueltos al final son lo que queda cuando se quita la
    // fecha de «Aplicar migraciones, 2026-09-04».
    .replace(/[\s,;:·—–-]+$/, "")
    .trim();

  if (limpio.length < 3) return null;
  return limpio.length > MAX_TITULO_TAREA ? `${limpio.slice(0, MAX_TITULO_TAREA - 1).trimEnd()}…` : limpio;
}

/** Tope de una memoria. Más largo que esto ya no es un hecho, es una nota. */
export const MAX_TEXTO_MEMORIA = 200;

// Los ámbitos válidos NO se repiten aquí: vienen de donde vive el tipo. Un
// valor fuera de la lista no falla en la pantalla, falla en el `insert` con un
// error de restricción que el usuario no puede interpretar — así que se
// comprueba antes de proponer, contra la única lista que hay.

/**
 * Lo que distingue una memoria de un dato del día.
 *
 * `memory_items` entra en el prompt de TODAS las features y no caduca sola, así
 * que lo que se cuele aquí seguirá contándose dentro de un año. «Hoy comió
 * avena» no es quién eres: es un renglón del diario, y el diario ya lo guarda.
 *
 * El `(?<!la |las )` delante de «mañana» no es un detalle: sin él, «entrena por
 * la mañana» —que es exactamente el tipo de hecho duradero que esto quiere
 * capturar— se rechazaría por contener un adverbio de tiempo que ahí no lo es.
 */
const EFIMERO =
  /\b(hoy|ayer|anoche|esta\s+(mañana|tarde|noche|semana)|este\s+(lunes|martes|miércoles|jueves|viernes|sábado|domingo)|(?<!la |las )mañana)\b/i;

/**
 * Lo que se acepta de una memoria propuesta por el modelo, o `null`.
 *
 * `null` es la respuesta normal: casi ningún turno revela algo que merezca
 * recordarse para siempre. Mismo criterio que `sanitizeProposedTask`, y por el
 * mismo motivo de D-089 — el modelo propone, guardar sigue siendo del usuario.
 */
export function sanitizeProposedMemory(
  propuesta: { text: string; scope: string } | null | undefined
): { text: string; scope: MemoryScope } | null {
  if (!propuesta) return null;

  const scope = propuesta.scope as MemoryScope;
  if (!MEMORY_SCOPES.includes(scope)) return null;

  const limpio = (propuesta.text ?? "").replace(/\s+/g, " ").trim();

  // Ocho y no tres: un fragmento de tres letras no es un hecho sobre nadie, y
  // aquí el coste de aceptar basura es permanente, no un botón que se ignora.
  if (limpio.length < 8) return null;
  if (CONTIENE_FECHA.test(limpio)) return null;
  if (EFIMERO.test(limpio)) return null;

  return {
    scope,
    text: limpio.length > MAX_TEXTO_MEMORIA ? `${limpio.slice(0, MAX_TEXTO_MEMORIA - 1).trimEnd()}…` : limpio
  };
}
