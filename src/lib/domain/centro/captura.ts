// src/lib/domain/centro/captura.ts
// Lo que separa «escribí una idea» de «la idea acabó en el sitio equivocado»
// (D-168). Puro, probado en tests/domain/centro-captura.test.ts.
//
// LA REGLA DE ORO: ante cualquier duda, se degrada a `pregunta`. Preguntar
// cuesta un toque; guardar algo en el cuaderno equivocado es un desorden que la
// persona tiene que ir a limpiar, y que probablemente descubra semanas después.

const MAX_TITULO = 120;
const MAX_CUERPO = 4000;
const MAX_PREGUNTA = 160;
/** Tres opciones caben en una línea y se eligen sin leer dos veces. */
const MAX_OPCIONES = 3;

export interface ContextoDeCaptura {
  notebooks: { id: string; title: string }[];
  proyectos: { id: string; title: string }[];
}

export interface CapturaCruda {
  clase: string;
  notebookId?: string;
  projectId?: string;
  titulo?: string;
  cuerpo?: string;
  pregunta?: string;
  opciones?: { etiqueta?: string; clase?: string; id?: string }[];
}

export type OpcionDeCaptura = { etiqueta: string; clase: "nota" | "tarea"; id: string };

export type CapturaSaneada =
  | { clase: "nota"; notebookId: string; titulo: string; cuerpo: string }
  | { clase: "tarea"; projectId: string; titulo: string }
  | { clase: "pregunta"; pregunta: string; opciones: OpcionDeCaptura[] };

const PREGUNTA_POR_DEFECTO = "¿Dónde la guardo?";

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function opcionesValidas(cruda: CapturaCruda, ctx: ContextoDeCaptura): OpcionDeCaptura[] {
  const salida: OpcionDeCaptura[] = [];
  for (const o of cruda.opciones ?? []) {
    if (salida.length >= MAX_OPCIONES) break;
    const etiqueta = texto(o.etiqueta, 60);
    const id = typeof o.id === "string" ? o.id : "";
    if (!etiqueta || !id) continue;
    if (o.clase === "nota" && ctx.notebooks.some((n) => n.id === id)) salida.push({ etiqueta, clase: "nota", id });
    else if (o.clase === "tarea" && ctx.proyectos.some((p) => p.id === id)) salida.push({ etiqueta, clase: "tarea", id });
  }
  return salida;
}

function preguntar(cruda: CapturaCruda, ctx: ContextoDeCaptura): CapturaSaneada {
  return {
    clase: "pregunta",
    // Una pregunta vacía dejaría botones sin enunciado. Siempre hay texto.
    pregunta: texto(cruda.pregunta, MAX_PREGUNTA) || PREGUNTA_POR_DEFECTO,
    opciones: opcionesValidas(cruda, ctx)
  };
}

/**
 * De lo que devolvió el modelo a algo que se puede proponer.
 *
 * El destino tiene que EXISTIR y ser de esta persona. La RLS lo impediría al
 * escribir, pero entonces el botón ya estaría pintado y el fallo sería un error
 * al aceptar, cuando la persona ya dijo que sí.
 */
export function sanearCaptura(cruda: CapturaCruda, ctx: ContextoDeCaptura): CapturaSaneada {
  const titulo = texto(cruda.titulo, MAX_TITULO);

  if (cruda.clase === "nota") {
    const id = typeof cruda.notebookId === "string" ? cruda.notebookId : "";
    if (!titulo || !ctx.notebooks.some((n) => n.id === id)) return preguntar(cruda, ctx);
    return { clase: "nota", notebookId: id, titulo, cuerpo: texto(cruda.cuerpo, MAX_CUERPO) };
  }

  if (cruda.clase === "tarea") {
    const id = typeof cruda.projectId === "string" ? cruda.projectId : "";
    if (!titulo || !ctx.proyectos.some((p) => p.id === id)) return preguntar(cruda, ctx);
    return { clase: "tarea", projectId: id, titulo };
  }

  return preguntar(cruda, ctx);
}
