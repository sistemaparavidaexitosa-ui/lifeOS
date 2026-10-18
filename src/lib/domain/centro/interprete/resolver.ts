// src/lib/domain/centro/interprete/resolver.ts
// Del análisis a algo que enseñar: cambios, una pregunta, «no lo encontré» o
// la IA (D-205). Puro, probado en tests/domain/centro-interprete-resolver.test.ts.
//
// LA SALIDA `cambios` ES EL MISMO CONTRATO QUE EL BLOQUE `propuesta_cambio`
// DEL MODELO: refs como `fila:<tabla>:<uuid>`, editar/borrar por `fila`. Así
// pasa por `proponerCambios` y hereda TODAS las barreras de D-203 (registro,
// `ai_domains`, fila leída, zod, revalidar al guardar) sin una línea nueva. Lo
// que el intérprete arma se valida aquí mismo con `validarCambio`: si no
// pasaría allí, no sale de aquí.

import type { Domain } from "../../insights/types.ts";
import { camposDe, entradaDe, type CampoDeEscritura, type EntradaDeEscritura } from "../escritura/registro.ts";
import { validarCambio, type Valor } from "../escritura/cambio.ts";
import type { Analisis } from "./analizar.ts";
import { normalizar, tramoOriginal } from "./normalizar.ts";

export interface Opcion {
  id: string;
  nombre: string;
}

export interface Candidato {
  /** `fila:<tabla>:<uuid>` */
  fila: string;
  nombre: string;
  /** El nombre, normalizado, es justo lo que se dijo. */
  exacta: boolean;
  /** La fila leída con la sesión: el «antes» del diff. */
  registro: Record<string, unknown>;
}

export interface Alimento {
  nombre: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
}

export interface ContextoDeResolucion {
  autorizados: readonly Domain[];
  /** Por tabla de ref (`projects`, `notebooks`): lo que la persona tiene, más reciente primero. */
  catalogo: Record<string, Opcion[]>;
  /** Editar/borrar: filas de la tabla que coinciden con lo dicho, mejor primero. */
  candidatos: Candidato[];
  /** Crear una comida: `foods` de la persona que coinciden con lo dicho. */
  alimentos: Alimento[];
  hoy: string;
}

export type Interpretacion =
  | { tipo: "ia"; motivo: string }
  | { tipo: "navegar"; destino: { href: string; etiqueta: string } }
  | { tipo: "pregunta"; entendi: string; opciones: { etiqueta: string; texto: string }[] }
  | { tipo: "nada"; entendi: string }
  | { tipo: "cambios"; entendi: string; cambios: unknown[]; filas: Map<string, Record<string, unknown>> };

const MAX_OPCIONES = 3;
const MAX_ETIQUETA = 40;
const MAX_ENTENDI = 300;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const VERBO = { crear: "Crear", editar: "Cambiar", borrar: "Borrar" } as const;

const ia = (motivo: string): Interpretacion => ({ tipo: "ia", motivo });

/** «Tarea» → «la tarea»; sin una tabla de géneros: todas las de hoy acaban en -a. */
function conArticulo(etiqueta: string): string {
  const e = etiqueta.toLowerCase();
  return `${e.endsWith("a") ? "la" : "el"} ${e}`;
}

function ninguno(etiqueta: string): string {
  return etiqueta.toLowerCase().endsWith("a") ? "ninguna" : "ningún";
}

/** «proyecto» de «en el proyecto»: la última palabra de la primera mención. */
function nombreDeRef(c: CampoDeEscritura): string {
  return c.menciones?.[0]?.split(" ").pop() ?? "destino";
}

function recortar(t: string, max: number): string {
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function legible(c: CampoDeEscritura, v: Valor): string {
  if (c.tipo === "fecha" && typeof v === "string") {
    const [, m, d] = v.split("-");
    return `${Number(d)} ${MESES[Number(m) - 1]}`;
  }
  if (c.tipo === "opcion" && typeof v === "string") return c.sinonimos?.[v]?.[0] ?? v.toLowerCase();
  return String(v);
}

/** «· vence 19 oct · prioridad alta»: fechas primero, luego en el orden del registro. */
function detalles(entrada: EntradaDeEscritura, campos: Record<string, Valor>): string {
  const lista = Object.entries(entrada.campos).filter(([n, c]) => n !== entrada.titulo && n !== entrada.dictado && c.tipo !== "ref" && campos[n] !== undefined && campos[n] !== null);
  lista.sort(([, a], [, b]) => Number(b.tipo === "fecha") - Number(a.tipo === "fecha"));
  return lista.map(([n, c]) => ` · ${c.etiqueta.toLowerCase()} ${legible(c, campos[n]!)}`).join("");
}

/** Dos opciones con el mismo nombre serían dos botones iguales: se numeran. */
function etiquetas(nombres: string[]): string[] {
  return nombres.map((n, i) => {
    const e = recortar(n, MAX_ETIQUETA - 4);
    return nombres.filter((x) => x === n).length > 1 ? `${e} (${i + 1})` : e;
  });
}

function uuidDe(fila: string): string {
  return fila.slice(fila.lastIndexOf(":") + 1);
}

function coincidencias(opciones: Opcion[], dicho: string): Opcion[] {
  const exactas = opciones.filter((o) => normalizar(o.nombre) === dicho);
  if (exactas.length) return exactas;
  return opciones.filter((o) => {
    const n = normalizar(o.nombre);
    return n.startsWith(dicho) || n.includes(dicho);
  });
}

export function resolverAnalisis(a: Analisis, ctx: ContextoDeResolucion): Interpretacion {
  if (a.tipo !== "escribir") return a;
  const entrada = entradaDe(a.tabla, ctx.autorizados);
  if (!entrada) return ia("dominio no autorizado");
  return a.operacion === "crear" ? resolverCrear(a, entrada, ctx) : resolverFila(a, entrada, ctx);
}

type Escribir = Extract<Analisis, { tipo: "escribir" }>;

function resolverCrear(a: Escribir, entrada: EntradaDeEscritura & { tabla: string }, ctx: ContextoDeResolucion): Interpretacion {
  const filas = new Map<string, Record<string, unknown>>();
  const campos: Record<string, Valor> = { ...a.valores };
  const enLaTarjeta: string[] = [];

  // Título: lo dicho, con las mayúsculas del original.
  const titulo = tramoOriginal(a.textoOriginal, a.resto);

  if (entrada.tabla === "food_entries") {
    // Sin el alimento en el catálogo no hay macros, y estimarlos es justo el
    // tipo de trabajo que se le deja a la IA.
    const al = ctx.alimentos.find((x) => normalizar(x.nombre) === a.resto) ?? ctx.alimentos.find((x) => normalizar(x.nombre).includes(a.resto));
    if (!al || !a.resto) return ia("alimento sin macros conocidos");
    Object.assign(campos, { name: al.nombre, kcal100: al.kcal100, protein100: al.protein100, carbs100: al.carbs100, fat100: al.fat100 });
    campos.local_date ??= ctx.hoy;
  } else {
    if (!a.resto) return ia("sin título");
    campos[entrada.dictado ?? entrada.titulo] = titulo;
  }

  for (const [nombre, c] of camposDe(entrada, "crear")) {
    if (c.tipo !== "ref" || !c.refTabla) continue;
    const opciones = ctx.catalogo[c.refTabla] ?? [];
    const dicho = a.menciones[nombre];
    const marcada = a.elegida ? opciones.filter((o) => o.id === a.elegida) : [];
    const elegibles = marcada.length ? marcada : dicho ? coincidencias(opciones, dicho) : opciones;
    const ref = nombreDeRef(c);
    if (!elegibles.length) {
      return dicho
        ? { tipo: "nada", entendi: `No encontré ${ninguno(ref)} ${ref} que se llame «${dicho}».` }
        : ia(`no hay ${ref}s`);
    }
    if (elegibles.length > 1) {
      const original = dicho ? tramoOriginal(a.textoOriginal, dicho) : "";
      const mostradas = elegibles.slice(0, MAX_OPCIONES);
      const nombres = etiquetas(mostradas.map((o) => o.nombre));
      return {
        tipo: "pregunta",
        entendi: recortar(`${VERBO.crear} ${conArticulo(entrada.etiqueta)} «${titulo}». ¿En qué ${ref}?`, MAX_ENTENDI),
        opciones: mostradas.map((o, i) => ({
          etiqueta: nombres[i]!,
          // Cada opción es la petición entera otra vez, ya sin la duda, y con
          // la marca de SU fila: al pulsarla se vuelve a entender sola, sin
          // estado guardado, aunque dos destinos se llamen igual.
          texto: `${dicho ? a.textoOriginal.replace(original, o.nombre) : `${a.textoOriginal} ${c.menciones![0]} ${o.nombre}`} #${o.id}`
        }))
      };
    }
    const o = elegibles[0]!;
    const fila = `fila:${c.refTabla}:${o.id}`;
    filas.set(fila, { id: o.id, title: o.nombre });
    campos[nombre] = fila;
    enLaTarjeta.push(o.nombre);
  }

  const cambio = { operacion: "crear", tabla: entrada.tabla, campos };
  const v = validarCambio(cambio, { filas, autorizados: ctx.autorizados });
  if (!v.ok) return ia(v.reason);

  const dictado = campos[entrada.dictado ?? entrada.titulo];
  const nombre = typeof dictado === "string" ? dictado : titulo;
  const destino = enLaTarjeta.length ? ` en ${enLaTarjeta.join(", ")}` : "";
  const entendi = `${VERBO.crear} ${conArticulo(entrada.etiqueta)} «${nombre}»${destino}${detalles(entrada, campos)}`;
  return { tipo: "cambios", entendi: recortar(entendi, MAX_ENTENDI), cambios: [cambio], filas };
}

function resolverFila(a: Escribir, entrada: EntradaDeEscritura & { tabla: string }, ctx: ContextoDeResolucion): Interpretacion {
  if (a.operacion === "editar" && !Object.keys(a.valores).length) return ia("editar sin ningún valor");
  if (!a.resto) return ia("sin nombre de la fila");

  const exactas = ctx.candidatos.filter((c) => c.exacta);
  const marcado = a.elegida ? ctx.candidatos.find((c) => uuidDe(c.fila) === a.elegida) : undefined;
  const elegido = marcado ?? (ctx.candidatos.length === 1 ? ctx.candidatos[0] : exactas.length === 1 ? exactas[0] : undefined);

  if (!ctx.candidatos.length) {
    const e = entrada.etiqueta.toLowerCase();
    return { tipo: "nada", entendi: `No encontré ${ninguno(e)} ${e} que se llame «${a.resto}».` };
  }
  if (!elegido) {
    const dicho = tramoOriginal(a.textoOriginal, a.resto);
    const mostrados = ctx.candidatos.slice(0, MAX_OPCIONES);
    const nombres = etiquetas(mostrados.map((c) => c.nombre));
    return {
      tipo: "pregunta",
      entendi: recortar(`${VERBO[a.operacion]} ${conArticulo(entrada.etiqueta)} «${dicho}». ¿Cuál de estas?`, MAX_ENTENDI),
      opciones: mostrados.map((c, i) => ({
        etiqueta: nombres[i]!,
        texto: `${a.textoOriginal.replace(dicho, `«${c.nombre}»`)} #${uuidDe(c.fila)}`
      }))
    };
  }

  if (a.operacion === "editar") {
    const salto = saltoNoPermitido(a, entrada, elegido);
    if (salto) return salto;
  }

  const filas = new Map([[elegido.fila, elegido.registro]]);
  const cambio = a.operacion === "borrar" ? { operacion: "borrar", fila: elegido.fila } : { operacion: "editar", fila: elegido.fila, campos: { ...a.valores } };
  const v = validarCambio(cambio, { filas, autorizados: ctx.autorizados });
  if (!v.ok) return ia(v.reason);

  const entendi = `${VERBO[a.operacion]} ${conArticulo(entrada.etiqueta)} «${elegido.nombre}»${a.operacion === "editar" ? detalles(entrada, v.cambio.campos) : ""}`;
  return { tipo: "cambios", entendi: recortar(entendi, MAX_ENTENDI), cambios: [cambio], filas };
}

/**
 * Un cambio de estado que la regla de la sección no deja (Pendiente →
 * Completada en tareas) no se propone: la tarjeta fallaría al Guardar. Se
 * ofrecen los pasos que sí se pueden dar desde donde está, como en su pantalla.
 */
function saltoNoPermitido(a: Escribir, entrada: EntradaDeEscritura, elegido: Candidato): Interpretacion | null {
  for (const [campo, hacia] of Object.entries(a.valores)) {
    const c = entrada.campos[campo];
    const desde = elegido.registro[campo];
    if (!c?.transiciones || typeof desde !== "string" || typeof hacia !== "string" || desde === hacia) continue;
    const posibles = c.transiciones[desde] ?? [];
    if (posibles.includes(hacia)) continue;
    const esta = `${conArticulo(entrada.etiqueta)[0]!.toUpperCase()}${conArticulo(entrada.etiqueta).slice(1)} «${elegido.nombre}» está ${legible(c, desde)}`;
    if (!posibles.length) return { tipo: "nada", entendi: `${esta} y ya no puede cambiar de ${c.etiqueta.toLowerCase()}.` };
    const marca = uuidDe(elegido.fila);
    return {
      tipo: "pregunta",
      entendi: recortar(`${esta} y no puede pasar directo a ${legible(c, hacia)}. ¿Qué hago?`, MAX_ENTENDI),
      opciones: posibles.slice(0, MAX_OPCIONES).map((p) => ({
        etiqueta: recortar(`Pasar a ${legible(c, p)}`, MAX_ETIQUETA),
        texto: `cambia ${conArticulo(entrada.etiqueta)} «${elegido.nombre}» a ${legible(c, p)} #${marca}`
      }))
    };
  }
  return null;
}
