// src/lib/domain/centro/interprete/analizar.ts
// De lo que escribió la persona a qué quiere hacer, sin modelo (D-205). Puro,
// probado en tests/domain/centro-interprete-analizar.test.ts.
//
// LA REGLA DE ORO (como la captura de D-168): ANTE CUALQUIER DUDA, `ia`. Un
// acierto ahorra tokens; un fallo pinta una tarjeta equivocada que la persona
// tiene que rechazar, y eso cuesta más que los tokens. Por eso se exige poco y
// claro: un verbo al principio, UNA tabla nombrada, y nada que pida criterio.
//
// Esto NO busca filas ni proyectos: devuelve lo que se dijo («en el proyecto
// rediseno», «la tarea llamar a juan»), y `resolverAnalisis` lo cruza con lo
// que la persona tiene.

import { ESCRITURA_POR_TABLA, camposDe, type EntradaDeEscritura, type Operacion, type TablaEscribible } from "../escritura/registro.ts";
import type { Valor } from "../escritura/cambio.ts";
import { comoPalabra, entreComillas, normalizar } from "./normalizar.ts";
import { extraerFecha, extraerNumero, extraerOpcion, type Hallazgo } from "./valores.ts";
import { VERBOS, VERBOS_DE_TABLA, destinoDe, pideCriterio } from "./vocabulario.ts";

export const MAX_TEXTO_INTERPRETABLE = 300;

/** `#<uuid>` al final del texto: la fila que se eligió en una pregunta. */
export const MARCA_DE_FILA = /\s*#([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i;

export type Analisis =
  | { tipo: "ia"; motivo: string }
  | { tipo: "navegar"; destino: { href: string; etiqueta: string } }
  | {
      tipo: "escribir";
      operacion: Operacion;
      tabla: TablaEscribible;
      /** Opciones, fechas y números ya extraídos, por campo. */
      valores: Record<string, Valor>;
      /** Campo ref → el nombre que se dijo, normalizado («rediseno»). */
      menciones: Record<string, string>;
      /** El título al crear; el nombre de la fila a buscar al editar o borrar. */
      resto: string;
      /** La petición, sin la marca `#<uuid>`. */
      textoOriginal: string;
      /**
       * El uuid de la marca `#<uuid>` del final, si la hay: lo pone una opción
       * de `pregunta` cuando dos filas se llaman igual, y es la única forma de
       * que elegir «la segunda» no vuelva a preguntar lo mismo.
       */
      elegida: string | null;
    };

/** Lo que sobra en los bordes del título: «una tarea DE llamar», «llamar a juan AL». */
const CONECTORES = new Set(["un", "una", "unos", "unas", "la", "el", "los", "las", "lo", "de", "del", "que", "para", "a", "al", "como", "en", "y", "por", "favor"]);
/** Lo que puede ir antes del verbo sin que deje de ser una orden. */
const PREVIOS = new Set(["porfa", "oye", "centro", "hey", "ahora", "ayer", "hoy", "manana"]);

const ia = (motivo: string): Analisis => ({ tipo: "ia", motivo });

function quitar(t: string, frase: string): string {
  return t.replace(comoPalabra(frase), " ").replace(/\s+/g, " ").trim();
}

function recortarBordes(t: string): string {
  const palabras = t.replace(/[,:;.]+/g, " ").split(/\s+/).filter(Boolean);
  while (palabras.length && CONECTORES.has(palabras[0]!)) palabras.shift();
  while (palabras.length && CONECTORES.has(palabras[palabras.length - 1]!)) palabras.pop();
  return palabras.join(" ");
}

/** El verbo, solo si es la primera palabra (o la segunda tras «oye», «ayer»…). */
function verboDe(palabras: string[]): { verbo: string; operacion: Operacion; deTabla?: (typeof VERBOS_DE_TABLA)[string] } | null {
  const candidatos = PREVIOS.has(palabras[0] ?? "") ? [palabras[0], palabras[1]] : [palabras[0]];
  for (const p of candidatos) {
    if (!p) continue;
    const deTabla = VERBOS_DE_TABLA[p];
    if (deTabla) return { verbo: p, operacion: deTabla.operacion, deTabla };
    for (const [operacion, verbos] of Object.entries(VERBOS) as [Operacion, readonly string[]][]) {
      if (verbos.includes(p)) return { verbo: p, operacion };
    }
  }
  return null;
}

/** Las tablas nombradas en el texto, por sus sinónimos (palabra completa). */
function tablasNombradas(n: string): { tabla: TablaEscribible; frase: string }[] {
  const salida: { tabla: TablaEscribible; frase: string }[] = [];
  for (const [tabla, e] of Object.entries(ESCRITURA_POR_TABLA) as [TablaEscribible, EntradaDeEscritura][]) {
    // El sinónimo más largo primero: «tareas» antes que «tarea».
    const frase = [...e.sinonimos].sort((a, b) => b.length - a.length).find((s) => comoPalabra(s).test(n));
    if (frase) salida.push({ tabla, frase });
  }
  return salida;
}

export function analizar(conMarca: string, hoy: string): Analisis {
  const marca = MARCA_DE_FILA.exec(conMarca);
  const elegida = marca ? marca[1]!.toLowerCase() : null;
  const texto = marca ? conMarca.slice(0, marca.index) : conMarca;
  if (texto.length > MAX_TEXTO_INTERPRETABLE) return ia("demasiado largo");
  if (/^\s*s[ií],?\s+sigue/i.test(texto) || /^\s*no era eso/i.test(texto)) return ia("viene de una tarjeta de la IA");

  const n = normalizar(texto);
  if (pideCriterio(texto, n)) return ia("pide criterio");

  const destino = destinoDe(n);
  if (destino) return { tipo: "navegar", destino };

  // El título entre comillas se aparta ANTES de leer valores: una fecha dentro
  // de «Reunión del lunes» es parte del nombre, no un vencimiento.
  const comillas = entreComillas(texto);
  let trabajo = comillas ? normalizar(texto.replace(/«[^»]+»|"[^"]+"|“[^”]+”/, " ")) : n;

  const v = verboDe(trabajo.split(" "));
  if (!v) return ia("sin verbo de acción");

  const nombradas = tablasNombradas(trabajo);
  const tabla = v.deTabla?.tabla ?? (nombradas.length === 1 ? nombradas[0]!.tabla : null);
  if (!tabla) return ia(nombradas.length ? "nombra más de una tabla" : "no nombra ninguna tabla");
  if (nombradas.some((t) => t.tabla !== tabla)) return ia("nombra más de una tabla");

  const entrada = ESCRITURA_POR_TABLA[tabla] as EntradaDeEscritura;
  if (!entrada.operaciones.includes(v.operacion)) return ia("operación no permitida en esa tabla");

  trabajo = quitar(trabajo, v.verbo);
  for (const t of nombradas) trabajo = quitar(trabajo, t.frase);

  const valores: Record<string, Valor> = { ...(v.deTabla?.valores ?? {}) };
  const campos = v.operacion === "borrar" ? [] : camposDe(entrada, v.operacion);
  let fechaUsada = false;
  for (const [nombre, c] of campos) {
    if (nombre in valores) continue;
    let h: Hallazgo<string | number> | null = null;
    if (c.tipo === "opcion" && c.sinonimos) h = extraerOpcion(trabajo, c.sinonimos);
    else if (c.tipo === "fecha" && !fechaUsada) {
      h = extraerFecha(trabajo, hoy);
      fechaUsada = h !== null;
    } else if ((c.tipo === "numero" || c.tipo === "entero") && c.unidades) h = extraerNumero(trabajo, c.unidades);
    if (!h) continue;
    valores[nombre] = h.valor;
    trabajo = quitar(trabajo, h.frase);
  }

  // Lo que se nombra como destino: «en el proyecto Rediseño», hasta la coma o el final.
  const menciones: Record<string, string> = {};
  for (const [nombre, c] of campos) {
    if (c.tipo !== "ref" || !c.menciones) continue;
    for (const m of [...c.menciones].sort((a, b) => b.length - a.length)) {
      const r = new RegExp(`(?<![a-z0-9])${m.replace(/ /g, "\\s+")}\\s+([^,]+)`).exec(trabajo);
      if (!r) continue;
      const dicho = recortarBordes(r[1]!);
      if (dicho) menciones[nombre] = dicho;
      trabajo = (trabajo.slice(0, r.index) + " " + trabajo.slice(r.index + r[0].length)).trim();
      break;
    }
  }

  const resto = comillas ?? recortarBordes(trabajo);
  return { tipo: "escribir", operacion: v.operacion, tabla, valores, menciones, resto, textoOriginal: texto, elegida };
}
