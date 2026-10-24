// Cómo se recorre un proyecto en la Lista: el árbol de tareas, las fichas de
// filtro rápido, las otras formas de agrupar y la búsqueda.
//
// Por defecto la Lista es un ÁRBOL: cada tarea principal con sus subtareas
// debajo, hasta tres subniveles. Lo que cuelga más hondo no se dibuja: el
// último nivel muestra cuántas hay y el detalle las enseña.
//
// Filtrar en un árbol tiene una trampa: si coincide una subtarea, su tarea
// principal tiene que verse para dar contexto, pero no debe parecer que ella
// también coincide. Por eso un nodo puede ser `contexto`: está porque algo
// de debajo coincide, y la vista lo pinta atenuado.
//
// Lo terminado no es un filtro: se pliega solo. Las subtareas hechas de cada
// padre se resumen en «2 hechas» y las tareas principales cerradas bajan a una
// sección «Hechas» al final. «Mostrar hechas» las devuelve a su sitio.
//
// Todo es puro y recibe `estadoDe` en vez de leer `status`: mientras corre el
// «Deshacer», la tarea se ve con su estado nuevo pero se queda donde estaba.

import { addDaysISO, diffDays, isOpen, type BoardFilters, type BoardTaskLike } from "../board.ts";
import type { Priority, TaskStatus } from "../types.ts";

/** Subniveles bajo la tarea principal (nivel 0) que la Lista dibuja. */
export const MAX_SUBNIVELES = 3;

export type Agrupacion = "principal" | "estado" | "fecha" | "ninguno";
export type OrdenLista = "manual" | "fecha" | "prioridad";

export interface Presentacion {
  agrupar: Agrupacion;
  orden: OrdenLista;
  /** Lo hecho y cancelado en su sitio, en vez de plegado al final. */
  hechas: boolean;
}

export const PRESENTACION_INICIAL: Presentacion = { agrupar: "principal", orden: "manual", hechas: false };

/** Para lo que vuelve del almacenamiento del navegador: nunca se confía a ciegas. */
export function esPresentacion(v: unknown): v is Presentacion {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    ["principal", "estado", "fecha", "ninguno"].includes(p.agrupar as string) &&
    ["manual", "fecha", "prioridad"].includes(p.orden as string) &&
    typeof p.hechas === "boolean"
  );
}

/** Las fichas bajo las pestañas. Excluyentes: una a la vez. */
export type Rapido = "todo" | "mias" | "hoy" | "vencidas" | "semana";

export const RAPIDOS: { clave: Rapido; etiqueta: string }[] = [
  { clave: "todo", etiqueta: "Todo" },
  { clave: "mias", etiqueta: "Mías" },
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "vencidas", etiqueta: "Vencidas" },
  { clave: "semana", etiqueta: "Semana" }
];

export function esRapido(v: unknown): v is Rapido {
  return RAPIDOS.some((r) => r.clave === v);
}

/**
 * Una ficha rápida es una forma de los filtros de siempre (board.ts): así la
 * Lista, el Tablero y el Calendario filtran exactamente igual. Se combina con
 * los filtros finos (prioridad, personas) de la hoja «Mostrar»; «Mías» manda
 * sobre las personas elegidas ahí.
 */
export function filtrosDeRapido(rapido: Rapido, base: BoardFilters, yo: string | null): BoardFilters {
  const f: BoardFilters = { ...base, text: "", hideDone: false, date: "all" };
  switch (rapido) {
    case "todo":
      return f;
    case "mias":
      return yo ? { ...f, people: [yo] } : f;
    case "hoy":
      return { ...f, date: "today" };
    case "vencidas":
      return { ...f, date: "overdue" };
    case "semana":
      return { ...f, date: "week" };
  }
}

/**
 * Lo que la Lista recuerda de cada proyecto: la ficha, la forma y lo plegado.
 * Viaja en una cookie para que el servidor pinte ya la lista como se dejó; con
 * almacenamiento del navegador se veía todo desplegado hasta hidratar y luego
 * saltaba.
 */
export interface PreferenciasLista {
  rapido: Rapido;
  presentacion: Presentacion;
  plegados: string[];
}

export const PREFERENCIAS_INICIALES: PreferenciasLista = { rapido: "todo", presentacion: PRESENTACION_INICIAL, plegados: [] };

/** Tope de ramas plegadas que se recuerdan: una cookie no da para más de ~4 KB. */
export const MAX_PLEGADOS = 60;

export function cookiePreferencias(projectId: string): string {
  return `xr-lista-${projectId}`;
}

export function escribirPreferencias(p: PreferenciasLista): string {
  return JSON.stringify({ r: p.rapido, p: p.presentacion, f: p.plegados.slice(-MAX_PLEGADOS) });
}

/** Nunca lanza: una cookie rota o vieja da los valores por defecto. */
export function leerPreferencias(crudo: string | undefined | null): PreferenciasLista {
  if (!crudo) return PREFERENCIAS_INICIALES;
  try {
    // La cookie se escribe codificada; según quién la lea llega ya decodificada o no.
    const o = JSON.parse(crudo.startsWith("%") ? decodeURIComponent(crudo) : crudo) as Record<string, unknown>;
    return {
      rapido: esRapido(o.r) ? o.r : "todo",
      presentacion: esPresentacion(o.p) ? o.p : PRESENTACION_INICIAL,
      plegados: Array.isArray(o.f) ? o.f.filter((x): x is string => typeof x === "string").slice(-MAX_PLEGADOS) : []
    };
  } catch {
    return PREFERENCIAS_INICIALES;
  }
}

// ---------------------------------------------------------------------------
// Orden
// ---------------------------------------------------------------------------

const PESO_PRIORIDAD: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export function comparar(orden: OrdenLista): (a: BoardTaskLike, b: BoardTaskLike) => number {
  const porFecha = (a: BoardTaskLike, b: BoardTaskLike) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
  const manual = (a: BoardTaskLike, b: BoardTaskLike) => a.position - b.position;
  if (orden === "fecha") return (a, b) => porFecha(a, b) || manual(a, b);
  if (orden === "prioridad")
    return (a, b) =>
      Number(b.urgent) - Number(a.urgent) || PESO_PRIORIDAD[a.priority] - PESO_PRIORIDAD[b.priority] || porFecha(a, b) || manual(a, b);
  return manual;
}

// ---------------------------------------------------------------------------
// Árbol
// ---------------------------------------------------------------------------

export interface Nodo<T> {
  tarea: T;
  /** 0 = tarea principal. */
  nivel: number;
  /** Hijas que se dibujan (vivas, o todas con «Mostrar hechas»). */
  hijos: Nodo<T>[];
  /** Hijas cerradas, plegadas en «N hechas». */
  hechas: Nodo<T>[];
  /** No coincide con el filtro: está porque algo de debajo sí. */
  contexto: boolean;
  /** Avance de las hijas directas, sin contar las canceladas ni el filtro. */
  avance: { hechas: number; total: number } | null;
  /** Hijas directas que pasan el filtro (para «1 de 5» en un nodo de contexto). */
  visibles: number;
  /** Descendientes más allá de MAX_SUBNIVELES: no se dibujan. */
  masHondas: number;
}

export interface Arbol<T> {
  abiertas: Nodo<T>[];
  /** Tareas principales cerradas: la sección «Hechas» del final. */
  cerradas: Nodo<T>[];
}

export function construirArbol<T extends BoardTaskLike>(
  tareas: T[],
  opts: {
    orden: OrdenLista;
    hechas: boolean;
    /** Sin filtro, undefined. */
    coincide?: (t: T) => boolean;
    estadoDe?: (t: T) => TaskStatus;
  }
): Arbol<T> {
  const estadoDe = opts.estadoDe ?? ((t: T) => t.status);
  const ids = new Set(tareas.map((t) => t.id));
  const hijasDe = new Map<string, T[]>();
  const raices: T[] = [];
  for (const t of tareas) {
    // Una hija cuyo padre no está (otro proyecto, datos viejos) es raíz.
    if (t.parentTaskId && ids.has(t.parentTaskId)) {
      const l = hijasDe.get(t.parentTaskId) ?? [];
      l.push(t);
      hijasDe.set(t.parentTaskId, l);
    } else raices.push(t);
  }

  // ¿Entra en la lista? Coincide o tiene algo debajo que coincide.
  const incluida = new Map<string, boolean>();
  const entra = (t: T): boolean => {
    const hit = incluida.get(t.id);
    if (hit !== undefined) return hit;
    incluida.set(t.id, false); // corta ciclos de datos corruptos
    const r = !opts.coincide || opts.coincide(t) || (hijasDe.get(t.id) ?? []).some(entra);
    incluida.set(t.id, r);
    return r;
  };

  // Una tarea cerrada con algo vivo debajo no se pliega: escondería trabajo.
  const vivaCache = new Map<string, boolean>();
  const viva = (t: T): boolean => {
    const hit = vivaCache.get(t.id);
    if (hit !== undefined) return hit;
    vivaCache.set(t.id, false);
    const r = isOpen(estadoDe(t)) || (hijasDe.get(t.id) ?? []).some((h) => entra(h) && viva(h));
    vivaCache.set(t.id, r);
    return r;
  };

  const cmp = comparar(opts.orden);
  const contarHondas = (t: T): number =>
    (hijasDe.get(t.id) ?? []).filter(entra).reduce((n, h) => n + 1 + contarHondas(h), 0);

  const nodo = (t: T, nivel: number): Nodo<T> => {
    const todas = hijasDe.get(t.id) ?? [];
    const contables = todas.filter((h) => estadoDe(h) !== "Cancelled");
    const avance = contables.length
      ? { hechas: contables.filter((h) => estadoDe(h) === "Completed").length, total: contables.length }
      : null;
    const dentro = todas.filter(entra).sort(cmp);
    const base = {
      tarea: t,
      nivel,
      contexto: Boolean(opts.coincide && !opts.coincide(t)),
      avance,
      visibles: dentro.length
    };
    if (nivel >= MAX_SUBNIVELES) return { ...base, hijos: [], hechas: [], masHondas: contarHondas(t) };
    const hijos: Nodo<T>[] = [];
    const hechas: Nodo<T>[] = [];
    for (const h of dentro) (opts.hechas || viva(h) ? hijos : hechas).push(nodo(h, nivel + 1));
    return { ...base, hijos, hechas, masHondas: 0 };
  };

  const abiertas: Nodo<T>[] = [];
  const cerradas: Nodo<T>[] = [];
  for (const r of raices.filter(entra).sort(cmp)) (opts.hechas || viva(r) ? abiertas : cerradas).push(nodo(r, 0));
  return { abiertas, cerradas };
}

/** Los ids de todos los nodos que tienen algo que plegar (para «plegar todo»). */
export function idsConHijas<T extends BoardTaskLike>(nodos: Nodo<T>[]): string[] {
  const out: string[] = [];
  const visitar = (n: Nodo<T>) => {
    if (n.hijos.length || n.hechas.length) out.push(n.tarea.id);
    n.hijos.forEach(visitar);
  };
  nodos.forEach(visitar);
  return out;
}

/**
 * Tras cerrar una subtarea: su padre, si todas sus hermanas ya están hechas
 * (las canceladas no cuentan) y él sigue abierto. La Lista lo propone cerrar.
 */
export function padreListoParaCerrar<T extends BoardTaskLike>(
  tareas: T[],
  hijaId: string,
  estadoDe: (t: T) => TaskStatus = (t) => t.status
): T | null {
  const hija = tareas.find((t) => t.id === hijaId);
  const padre = hija?.parentTaskId ? tareas.find((t) => t.id === hija.parentTaskId) : undefined;
  if (!padre || !isOpen(estadoDe(padre))) return null;
  const hermanas = tareas.filter((t) => t.parentTaskId === padre.id && estadoDe(t) !== "Cancelled");
  return hermanas.length > 0 && hermanas.every((t) => estadoDe(t) === "Completed") ? padre : null;
}

// ---------------------------------------------------------------------------
// Agrupaciones planas: por estado, por fecha o ninguna
// ---------------------------------------------------------------------------

export type ClaveFecha = "vencidas" | "hoy" | "manana" | "semana" | "despues" | "sinfecha";
export type ClaveSeccion = TaskStatus | ClaveFecha | "todas" | "hechas";

export interface Seccion<T> {
  clave: ClaveSeccion;
  tareas: T[];
  /** Sugerencia de la vista: empieza plegada. */
  plegada: boolean;
}

const ORDEN_ESTADOS: TaskStatus[] = ["InProgress", "Pending", "Blocked", "Rescheduled", "Completed", "Cancelled"];
const ORDEN_FECHAS: ClaveFecha[] = ["vencidas", "hoy", "manana", "semana", "despues", "sinfecha"];

export function claveFecha(due: string | null, today: string): ClaveFecha {
  if (!due) return "sinfecha";
  if (due < today) return "vencidas";
  if (due === today) return "hoy";
  if (due === addDaysISO(today, 1)) return "manana";
  return diffDays(today, due) <= 7 ? "semana" : "despues";
}

/**
 * Todas las tareas de cualquier nivel, sin árbol (la fila lleva la ruta de su
 * padre). Lo cerrado va en sus propias secciones, plegadas salvo con
 * «Mostrar hechas».
 */
export function agruparPlano<T extends BoardTaskLike>(
  tareas: T[],
  agrupar: Exclude<Agrupacion, "principal">,
  opts: { orden: OrdenLista; hechas: boolean; today: string; coincide?: (t: T) => boolean; estadoDe?: (t: T) => TaskStatus }
): Seccion<T>[] {
  const estadoDe = opts.estadoDe ?? ((t: T) => t.status);
  const cmp = comparar(opts.orden);
  const lista = (opts.coincide ? tareas.filter(opts.coincide) : tareas).slice().sort(cmp);

  if (agrupar === "estado") {
    return ORDEN_ESTADOS.map((e) => ({
      clave: e as ClaveSeccion,
      tareas: lista.filter((t) => estadoDe(t) === e),
      plegada: !opts.hechas && !isOpen(e)
    })).filter((s) => s.tareas.length);
  }

  const vivas = lista.filter((t) => isOpen(estadoDe(t)));
  const cerradas = lista.filter((t) => !isOpen(estadoDe(t)));
  const secciones: Seccion<T>[] =
    agrupar === "fecha"
      ? ORDEN_FECHAS.map((f) => ({
          clave: f as ClaveSeccion,
          // Por fecha, el orden dentro de cada día es el elegido; entre días, el calendario.
          tareas: vivas.filter((t) => claveFecha(t.due, opts.today) === f),
          plegada: false
        }))
      : [{ clave: "todas", tareas: vivas, plegada: false }];
  secciones.push({ clave: "hechas", tareas: cerradas, plegada: !opts.hechas });
  return secciones.filter((s) => s.tareas.length);
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

/** Minúsculas y sin acentos: «reunion» encuentra «Reunión». */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Parte `texto` en trozos marcando dónde aparece `consulta`, ignorando acentos
 * y mayúsculas, sin perder los caracteres originales.
 */
export function resaltar(texto: string, consulta: string): { texto: string; marca: boolean }[] {
  const q = normalizar(consulta.trim());
  if (!q) return [{ texto, marca: false }];
  // Normalizar carácter a carácter guarda de qué índice original sale cada
  // letra normalizada; así el resalte cae sobre «Reunión» y no sobre «Reunion».
  let plano = "";
  const origen: number[] = [];
  Array.from(texto).forEach((ch, i) => {
    for (const c of normalizar(ch)) {
      plano += c;
      origen.push(i);
    }
  });
  const chars = Array.from(texto);
  const trozos: { texto: string; marca: boolean }[] = [];
  let desde = 0;
  let pos = plano.indexOf(q);
  while (pos !== -1) {
    const ini = origen[pos] ?? chars.length;
    const fin = (origen[pos + q.length - 1] ?? chars.length - 1) + 1;
    if (ini > desde) trozos.push({ texto: chars.slice(desde, ini).join(""), marca: false });
    trozos.push({ texto: chars.slice(ini, fin).join(""), marca: true });
    desde = fin;
    pos = plano.indexOf(q, pos + q.length);
  }
  if (desde < chars.length) trozos.push({ texto: chars.slice(desde).join(""), marca: false });
  return trozos;
}

export interface Resultado<T> {
  tarea: T;
  /** Títulos de los ancestros, de la raíz hacia abajo. */
  ruta: string[];
  /** Coincide en las notas, no en el título. */
  enNotas: boolean;
}

export function buscar<T extends BoardTaskLike>(
  tareas: T[],
  consulta: string,
  notas: Record<string, string> = {},
  limite = 50
): Resultado<T>[] {
  const q = normalizar(consulta.trim());
  if (!q) return [];
  const porId = new Map(tareas.map((t) => [t.id, t]));
  const ruta = (t: T): string[] => {
    const out: string[] = [];
    const vistos = new Set<string>();
    for (let p = t.parentTaskId ? porId.get(t.parentTaskId) : undefined; p && !vistos.has(p.id); p = p.parentTaskId ? porId.get(p.parentTaskId) : undefined) {
      vistos.add(p.id);
      out.unshift(p.title);
    }
    return out;
  };
  const puntuadas: { r: Resultado<T>; peso: number }[] = [];
  for (const t of tareas) {
    const titulo = normalizar(t.title);
    const i = titulo.indexOf(q);
    const enNotas = i === -1 && normalizar(notas[t.id] ?? "").includes(q);
    if (i === -1 && !enNotas) continue;
    // Vivas antes que cerradas; empieza por la consulta antes que la contiene; título antes que notas.
    const peso = (isOpen(t.status) ? 0 : 100) + (enNotas ? 20 : i === 0 ? 0 : /\s/.test(titulo[i - 1] ?? "") ? 5 : 10);
    puntuadas.push({ r: { tarea: t, ruta: ruta(t), enNotas }, peso });
  }
  return puntuadas
    .sort((a, b) => a.peso - b.peso || a.r.tarea.title.localeCompare(b.r.tarea.title, "es"))
    .slice(0, limite)
    .map((p) => p.r);
}
