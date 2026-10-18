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
import { extraerFecha, extraerNumero, extraerNumeroSuelto, extraerOpcion, extraerRangoDeHoras, type Hallazgo } from "./valores.ts";
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
const CONECTORES = new Set(["un", "una", "unos", "unas", "la", "el", "los", "las", "lo", "de", "del", "que", "para", "a", "al", "como", "en", "y", "por", "favor", "mi", "mis"]);
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

const REGISTRO = ESCRITURA_POR_TABLA as Record<TablaEscribible, EntradaDeEscritura>;

/** Verbos que solo existen como `crearCon` de alguna tabla («ponme»). */
const SOLO_CREAR_CON = new Set(Object.values(REGISTRO).flatMap((e) => e.crearCon ?? []));

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
    if (SOLO_CREAR_CON.has(p)) return { verbo: p, operacion: "crear" };
  }
  return null;
}

type Nombrada = { tabla: TablaEscribible; frase: string };

/**
 * Las tablas nombradas en el texto, por sus sinónimos (palabra completa). El
 * sinónimo más largo se lleva su tramo: «meta de ahorro» no deja que «meta»
 * cuente también como meta personal.
 */
function tablasNombradas(n: string): Nombrada[] {
  const todas: Nombrada[] = [];
  for (const [tabla, e] of Object.entries(REGISTRO) as [TablaEscribible, EntradaDeEscritura][]) {
    for (const frase of e.sinonimos) if (comoPalabra(frase).test(n)) todas.push({ tabla, frase });
  }
  todas.sort((a, b) => b.frase.length - a.frase.length);
  const salida: Nombrada[] = [];
  let resto = n;
  for (const t of todas) {
    if (salida.some((s) => s.tabla === t.tabla) || !comoPalabra(t.frase).test(resto)) continue;
    salida.push(t);
    resto = quitar(resto, t.frase);
  }
  return salida;
}

/**
 * Por qué la tabla `t` es solo parte de una orden sobre `de` y no la orden:
 * - `mencion`: es el destino de una ref de `de` y se nombra con su mención
 *   («una tarea … EN EL PROYECTO Casa»);
 * - `dictado`: es la ref que `de` toma de lo dictado («recuérdame LA TAREA x»);
 * - `opcion`: la palabra es un valor de un campo de `de` («el proyecto a ACTIVO»).
 */
function subordinada(t: Nombrada, de: TablaEscribible, n: string): "mencion" | "dictado" | "opcion" | null {
  const e = REGISTRO[de];
  for (const [nombre, c] of Object.entries(e.campos)) {
    if (c.tipo === "ref" && c.refTabla === t.tabla) {
      if (e.dictado === nombre) return "dictado";
      if (c.menciones?.some((m) => comoPalabra(m).test(n))) return "mencion";
    }
    if (c.tipo === "opcion" && Object.values(c.sinonimos ?? {}).some((fs) => fs.includes(t.frase))) return "opcion";
  }
  return null;
}

/** La tabla de la orden: la única nombrada que no es parte de otra. */
function tablaPrincipal(nombradas: Nombrada[], n: string, delVerbo?: TablaEscribible): { tabla: TablaEscribible; porDictado: Nombrada[] } | { motivo: string } {
  // Un verbo que ya dice la tabla («gasté», «desayuné») hace del resto de
  // palabras contenido: «gasté 300 en COMIDA» no nombra la tabla de comidas.
  if (delVerbo) return { tabla: delVerbo, porDictado: nombradas.filter((t) => t.tabla !== delVerbo && subordinada(t, delVerbo, n) === "dictado") };
  const libres = nombradas.filter((t) => !nombradas.some((u) => u.tabla !== t.tabla && subordinada(t, u.tabla, n)));
  const tabla = libres.length === 1 ? libres[0]!.tabla : null;
  if (!tabla) return { motivo: libres.length ? "nombra más de una tabla" : "no nombra ninguna tabla" };
  if (libres.some((t) => t.tabla !== tabla)) return { motivo: "nombra más de una tabla" };
  return { tabla, porDictado: nombradas.filter((t) => t.tabla !== tabla && subordinada(t, tabla, n) === "dictado") };
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
  const p = tablaPrincipal(nombradas, trabajo, v.deTabla?.tabla);
  if ("motivo" in p) return ia(p.motivo);
  const tabla = p.tabla;

  const entrada = REGISTRO[tabla];
  // «Marca el hábito» es crear su registro del día, no editar el hábito.
  const operacion: Operacion = entrada.crearCon?.includes(v.verbo) ? "crear" : v.operacion;
  if (!entrada.operaciones.includes(operacion)) return ia("operación no permitida en esa tabla");

  trabajo = quitar(trabajo, v.verbo);
  // La frase de la tabla, y la de las que solo nombran lo dictado («la TAREA x»).
  // Las mencionadas se quedan: su mención las recoge abajo con el nombre.
  for (const t of [...nombradas.filter((t) => t.tabla === tabla), ...p.porDictado]) trabajo = quitar(trabajo, t.frase);

  const nombrada = nombradas.find((t) => t.tabla === tabla)?.frase;
  const valores: Record<string, Valor> = { ...(v.deTabla?.valores ?? {}), ...(nombrada ? (entrada.valoresPorSinonimo?.[nombrada] ?? {}) : {}) };
  const campos = operacion === "borrar" ? [] : camposDe(entrada, operacion);
  let fechaUsada = false;
  const tomar = (nombre: string, h: Hallazgo<string | number> | null) => {
    if (!h) return;
    valores[nombre] = h.valor;
    trabajo = quitar(trabajo, h.frase);
  };
  // Las horas, antes que fechas y números: «de 9 a 2» no son dos números sueltos.
  const horas = campos.filter(([, c]) => c.tipo === "hora");
  if (horas.length === 2) {
    const r = extraerRangoDeHoras(trabajo);
    if (r) {
      valores[horas[0]![0]] = r.valor[0];
      valores[horas[1]![0]] = r.valor[1];
      trabajo = quitar(trabajo, r.frase);
    }
  }
  for (const [nombre, c] of campos) {
    if (nombre in valores) continue;
    if (c.tipo === "opcion" && c.sinonimos) tomar(nombre, extraerOpcion(trabajo, c.sinonimos));
    else if (c.tipo === "fecha" && !fechaUsada) {
      const h = extraerFecha(trabajo, hoy);
      fechaUsada = h !== null;
      tomar(nombre, h);
    } else if ((c.tipo === "numero" || c.tipo === "entero") && c.etiquetas) tomar(nombre, extraerNumero(trabajo, c.unidades ?? [], c.etiquetas));
  }
  // Los números con solo su unidad, DESPUÉS de los que traen etiqueta: en
  // «ahorrado 2000 pesos, objetivo 50000 pesos» cada uno se lleva el suyo.
  for (const [nombre, c] of campos) {
    if (nombre in valores || (c.tipo !== "numero" && c.tipo !== "entero") || !c.unidades) continue;
    tomar(nombre, extraerNumero(trabajo, c.unidades));
  }
  // Y al final, el número sin nada alrededor, para el campo que lo admite.
  for (const [nombre, c] of campos) {
    if (nombre in valores || !c.suelto) continue;
    tomar(nombre, extraerNumeroSuelto(trabajo));
  }

  // Lo que se nombra como destino: «en el proyecto Rediseño», hasta la coma o el final.
  const menciones: Record<string, string> = {};
  for (const [nombre, c] of campos) {
    if (c.tipo !== "ref" || !c.menciones) continue;
    for (const m of [...c.menciones].sort((a, b) => b.length - a.length)) {
      const r = new RegExp(`(?<![a-z0-9])${m.replace(/ /g, "\\s+")}\\s+([^,:]+)`).exec(trabajo);
      if (!r) continue;
      const dicho = recortarBordes(r[1]!);
      if (dicho) menciones[nombre] = dicho;
      trabajo = (trabajo.slice(0, r.index) + " " + trabajo.slice(r.index + r[0].length)).trim();
      break;
    }
  }

  const resto = comillas ?? recortarBordes(trabajo);
  return { tipo: "escribir", operacion, tabla, valores, menciones, resto, textoOriginal: texto, elegida };
}
