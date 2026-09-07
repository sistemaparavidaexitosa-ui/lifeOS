// src/lib/domain/coach/proposals.ts
// Las propuestas del coach — lógica pura: sin Supabase, sin red, sin `new Date()`.
//
// POR QUÉ SE SANEAN DOS VECES
// El modelo devuelve `datos` como una CADENA de JSON, no como un objeto: el
// esquema de Gemini no admite uniones discriminadas, y un esquema que fingiera
// que las cinco formas son la misma acabaría dejando pasar un bloque de tiempo
// sin horas. Así que la forma real se comprueba aquí, al guardar, y la acción
// que finalmente escribe vuelve a validar lo suyo con su propio zod. Es el
// mismo criterio que `sanitizeProposedTask`: lo que llega del modelo se limpia
// antes de tocar nada, y lo que llega del navegador se vuelve a limpiar.
//
// LO QUE ESTE ARCHIVO GARANTIZA: una propuesta que sale de aquí se puede pintar
// en un botón y ejecutar sin sorpresas. La que no cumple, no sale — se descarta
// entera en vez de guardarse a medias, porque un botón que falla al pulsarlo es
// peor que un botón que no existe.

export const TIPOS = ["tarea", "bloque", "rutina", "estructura", "meta"] as const;
export type Tipo = (typeof TIPOS)[number];

export const AREAS = ["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"] as const;
export const CATEGORIAS = ["Trabajo", "Familia", "Personal", "Salud", "Descanso", "Otros"] as const;
export const FRECUENCIAS = ["Diario", "Semanal", "Entre semana", "Fin de semana"] as const;

/** Ni un título de botón ni una explicación pueden crecer sin límite en una columna estrecha. */
const MAX_TITULO = 90;
const MAX_DETALLE = 160;

export interface PropuestaCruda {
  tipo: string;
  titulo: string;
  detalle: string;
  /** JSON en texto, tal como lo devolvió el modelo. Puede venir vacío o roto. */
  datos: string;
}

export interface PropuestaSaneada {
  tipo: Tipo;
  titulo: string;
  detalle: string;
  payload: Record<string, string>;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/** El JSON del modelo, o un objeto vacío. Nunca lanza: `datos` viene de fuera. */
function leerDatos(datos: string): Record<string, unknown> {
  const limpio = datos.trim();
  if (!limpio) return {};
  try {
    const parsed: unknown = JSON.parse(limpio);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function unaDe<T extends string>(valor: unknown, opciones: readonly T[], porDefecto: T): T {
  return typeof valor === "string" && (opciones as readonly string[]).includes(valor) ? (valor as T) : porDefecto;
}

/**
 * Una propuesta lista para guardarse, o `null`.
 *
 * `null` cubre todas las formas de estar mal —tipo desconocido, título vacío,
 * un bloque cuyo fin no es posterior a su inicio, una estructura sin proyecto—
 * y no las distingue: quien llama las trata igual, descartándola.
 */
export function sanearPropuesta(cruda: PropuestaCruda): PropuestaSaneada | null {
  const tipo = TIPOS.find((t) => t === cruda.tipo);
  if (!tipo) return null;

  const titulo = texto(cruda.titulo, MAX_TITULO);
  if (!titulo) return null;

  const detalle = texto(cruda.detalle, MAX_DETALLE);
  const datos = leerDatos(cruda.datos);

  switch (tipo) {
    case "tarea":
      // El título ES la tarea. No lleva fecha, igual que `sanitizeProposedTask`:
      // una fecha inventada deja el tablero lleno de tareas vencidas.
      return { tipo, titulo, detalle, payload: {} };

    case "bloque": {
      const start = texto(datos.start, 5);
      const end = texto(datos.end, 5);
      // Sin horas válidas no hay bloque que crear, y un bloque de duración cero
      // o negativa lo rechazaría la acción de todas formas: mejor no ofrecerlo.
      if (!HORA.test(start) || !HORA.test(end) || end <= start) return null;
      return {
        tipo,
        titulo,
        detalle,
        payload: {
          title: texto(datos.title, MAX_TITULO) || titulo,
          start,
          end,
          category: unaDe(datos.category, CATEGORIAS, "Personal")
        }
      };
    }

    case "rutina":
      return {
        tipo,
        titulo,
        detalle,
        payload: {
          name: texto(datos.name, MAX_TITULO) || titulo,
          frequency: unaDe(datos.frequency, FRECUENCIAS, "Diario")
        }
      };

    case "estructura": {
      const projectId = texto(datos.projectId, 36);
      // Sin un proyecto real no hay a dónde llevar al usuario. El modelo tiene
      // el id porque el hecho `execution.sin-estructura.<id>` lo lleva dentro.
      if (!UUID.test(projectId)) return null;
      return { tipo, titulo, detalle, payload: { projectId } };
    }

    case "meta":
      return {
        tipo,
        titulo,
        detalle,
        payload: {
          title: texto(datos.title, MAX_TITULO) || titulo,
          area: unaDe(datos.area, AREAS, "Personal")
        }
      };
  }
}

/** Las que sobreviven, con tope. Dos es lo que el prompt pide y lo que cabe en el rail. */
export function sanearPropuestas(crudas: readonly PropuestaCruda[], max = 2): PropuestaSaneada[] {
  const salida: PropuestaSaneada[] = [];
  for (const c of crudas) {
    const limpia = sanearPropuesta(c);
    if (limpia) salida.push(limpia);
    if (salida.length >= max) break;
  }
  return salida;
}
