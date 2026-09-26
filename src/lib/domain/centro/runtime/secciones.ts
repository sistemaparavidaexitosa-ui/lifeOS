// src/lib/domain/centro/runtime/secciones.ts
// El catálogo de secciones del runtime del Centro (D-188). Puro, probado en
// tests/domain/centro-runtime-catalogo.test.ts.
//
// POR QUÉ UN CATÁLOGO CERRADO. Una sección es un `kind` y unos datos, y el
// `kind` es lo único que el renderer usa para elegir componente. Si el
// vocabulario fuera abierto, el día que el modelo diga «iframe» habría que
// decidir en el renderer qué hacer con él; cerrado, lo rechaza el validador y el
// renderer nunca se entera.
//
// POR QUÉ ESTÁN LOS 24 AUNQUE SOLO SEIS TENGAN COMPONENTE. El contrato se fija
// ahora, cuando no hay datos escritos: un plan que pida `portfolio` es legal y
// se pinta como `emptyState` hasta que exista su componente. Ampliar un
// vocabulario con pantallas en uso es una migración; declararlo hoy, un tipo.

import type { TipoDeMovimiento } from "../../money/curva-inversion.ts";
import type { Operacion, TipoCampo } from "../escritura/registro.ts";

export const SECTION_KINDS = [
  "hero",
  "text",
  "narrative",
  "chat",
  "portfolio",
  "watchlist",
  "chart",
  "timeline",
  "calendar",
  "tasks",
  "projects",
  "habits",
  "books",
  "money",
  "cards",
  "table",
  "metric",
  "graph",
  "journal",
  "knowledge",
  "quickActions",
  "emptyState",
  "error",
  "loading",
  // Fase 2 (D-194): el vocabulario del agente de interfaz.
  "lista",
  "metricas",
  "irA",
  "recomendaciones",
  "insight",
  "movimientos",
  // T3: la rutina de hoy, por delante en «Hoy» cuando el agente reemplaza al
  // arranque guiado viejo.
  "rutina",
  // D-202: un movimiento de inversión que el agente propone y la persona guarda.
  "propuestaMovimiento",
  // D-203: cambios en cualquier tabla del registro, que la persona guarda.
  "propuestaCambio"
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

export function esSectionKind(v: unknown): v is SectionKind {
  return typeof v === "string" && (SECTION_KINDS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Los datos de cada tipo. SOLO datos: nada ejecutable, nada de marcado. Los
// enlaces van en campos llamados `href`, que el validador revisa uno por uno.
// ---------------------------------------------------------------------------

/**
 * Los topes de longitud de los textos que el validador exige. Viven aquí, en el
 * contrato, porque los usan los DOS lados: el validador para rechazar y los
 * hidratadores para recortar lo que escribió la persona. Si se separaran, un
 * título largo tumbaría la pantalla entera todos los días (lo encontró la
 * revisión final: nada en la base limita un título de tarea).
 */
export const LIMITES = {
  heroFrase: 200,
  tareaTitulo: 200,
  tareaContexto: 120,
  // Fase 2 (D-194): lo que el resolver del agente lee de una fila. Un valor de
  // la base no tiene tope; el campo que lo pinta, sí.
  itemTitulo: 160,
  itemDetalle: 160,
  itemEstado: 60,
  metricaValor: 40,
  celda: 80,
  /** El contrato admite etiquetas de 60; la cabecera de una tabla, 40. */
  columna: 40,
  fechaCorta: 40
} as const;

/** Recorta a `max` caracteres con puntos suspensivos. Lo usan los hidratadores. */
export function recortar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

export interface DatosHero {
  saludo: string;
  nombre: string;
  fechaISO: string;
  /** Una frase bajo el saludo. `null` = no hay nada que decir, y no se inventa. */
  frase: string | null;
}

export interface DatosText {
  texto: string;
}

export interface DatosNarrative {
  titulo: string;
  texto: string;
  href: string | null;
}

export interface DatosChat {
  mensajes: { rol: "persona" | "centro"; texto: string }[];
}

/** Verde, rojo o neutro. Solo las variaciones llevan color. */
export type Tono = "ok" | "bad" | "info";

/**
 * FORMA RESUELTA (Fase 2, D-194). Lo que llega al renderer ya viene formateado
 * por el servidor —«$18,742.32», «24 sep 2026»—: el componente pinta cadenas y
 * no sabe de monedas ni de locales. Las gráficas son la excepción: necesitan
 * el número para dibujar.
 */
export interface DatosLista {
  titulo: string;
  items: { id: string; titulo: string; detalle: string | null; estado: string | null; href: string | null }[];
}

export interface DatosMetricas {
  titulo: string | null;
  items: { etiqueta: string; valor: string }[];
}

export interface DatosTable {
  titulo: string;
  columnas: string[];
  filas: { id: string; celdas: string[]; href: string | null }[];
}

export interface DatosChart {
  titulo: string;
  tipo: "linea" | "barras";
  /** «MXN», «%», «» — para el eje, no para calcular. */
  unidad: string;
  puntos: { x: string; y: number }[];
}

export interface DatosCards {
  titulo: string;
  items: { id: string; titulo: string; detalle: string | null; href: string | null }[];
}

export interface DatosTimeline {
  titulo: string;
  items: { id: string; fecha: string; titulo: string; href: string | null }[];
}

export interface DatosIrA {
  destinos: { etiqueta: string; href: string }[];
}

export interface DatosRecomendaciones {
  /** `propuestaId` es la fila de `coach_proposals`: aceptar pasa por `acceptProposal`. */
  items: { propuestaId: string; titulo: string; motivo: string }[];
}

export interface DatosInsight {
  texto: string;
}

export interface DatosPortfolio {
  total: string;
  /** «Valuación al 12 sep 2026 · 2 inversiones en otra moneda no suman». */
  nota: string;
  /** Vacía = no hay historia suficiente, y no se dibuja. */
  serie: { x: string; y: number }[];
}

export interface DatosMovimientos {
  /** `false` = falta la llave de mercado: se enseñan los tickers sin cifras. */
  configurado: boolean;
  items: {
    ticker: string;
    nombre: string;
    precio: string | null;
    variacion: string | null;
    tono: Tono | null;
    nota: string | null;
  }[];
}

export interface DatosWatchlist {
  configurado: boolean;
  items: {
    ticker: string;
    nombre: string;
    precio: string | null;
    variacion: string | null;
    tono: Tono | null;
    /** Cierres para la sparkline, del más viejo al más nuevo. Vacía = sin línea. */
    serie: number[];
  }[];
}

/**
 * La rutina de ahora, con sus hábitos pendientes (T3). Nace de
 * `construirSecuencia` filtrada a `routineStep`: la MISMA regla de hora que
 * decide el arranque guiado, para no volver a escribirla aquí.
 */
export interface DatosPropuestaMovimiento {
  investmentId: string;
  posicion: string;
  moneda: string;
  tipo: TipoDeMovimiento;
  monto: number;
  fecha: string;
  nota: string | null;
}

export interface CampoDeTarjeta {
  campo: string;
  etiqueta: string;
  tipo: TipoCampo;
  antes: string | null;
  despues: string | null;
  editable: boolean;
  opciones: string[] | null;
}

export interface ItemDeCambio {
  propuestaId: string;
  operacion: Operacion;
  etiquetaTabla: string;
  titulo: string;
  campos: CampoDeTarjeta[];
}

export interface DatosPropuestaCambio {
  items: ItemDeCambio[];
}

export interface DatosRutina {
  routineId: string;
  nombre: string;
  habitos: { habitId: string; nombre: string; duracionMin: number | null }[];
}

export interface DatosCalendar {
  dias: { fechaISO: string; bloques: { inicio: string; fin: string; titulo: string }[] }[];
}

export interface ItemDeTarea {
  id: string;
  titulo: string;
  /** «Proyecto · Malpaso», «Una cosa»… `null` si el grafo no supo decirlo. */
  contexto: string | null;
  href: string | null;
}

export interface DatosTasks {
  fechaISO: string;
  items: ItemDeTarea[];
}

export interface DatosProjects {
  items: { id: string; titulo: string; progresoPct: number | null; href: string }[];
}

export interface DatosHabits {
  items: { id: string; nombre: string; hecho: boolean }[];
}

export interface DatosBooks {
  items: { id: string; titulo: string; autor: string | null; progresoPct: number | null }[];
}

export interface DatosMoney {
  moneda: string;
  patrimonio: number | null;
  flujoDelMes: number | null;
  proximosPagos: { concepto: string; monto: number; fechaISO: string }[];
}

export interface DatosMetric {
  etiqueta: string;
  valor: string;
  tendencia: "sube" | "baja" | "igual" | null;
}

export interface DatosGraph {
  raizId: string;
  vista: string;
}

export interface DatosJournal {
  entradas: { fechaISO: string; texto: string }[];
}

export interface DatosKnowledge {
  items: { titulo: string; extracto: string; href: string | null }[];
}

/** Iconos con nombre de destino, no de dibujo: qué SVG le toca lo decide el componente. */
export type IconoDeAccion = "proyectos" | "biblioteca" | "finanzas" | "rutinas";

export interface AccionRapida {
  etiqueta: string;
  detalle: string;
  href: string;
  icono: IconoDeAccion;
}

export interface DatosQuickActions {
  items: AccionRapida[];
}

/** `emptyState`, `error` y `loading` dicen una cosa y nada más. */
export interface DatosMensaje {
  mensaje: string;
}

export interface DatosPorKind {
  hero: DatosHero;
  text: DatosText;
  narrative: DatosNarrative;
  chat: DatosChat;
  portfolio: DatosPortfolio;
  watchlist: DatosWatchlist;
  chart: DatosChart;
  timeline: DatosTimeline;
  calendar: DatosCalendar;
  tasks: DatosTasks;
  projects: DatosProjects;
  habits: DatosHabits;
  books: DatosBooks;
  money: DatosMoney;
  cards: DatosCards;
  table: DatosTable;
  metric: DatosMetric;
  graph: DatosGraph;
  journal: DatosJournal;
  knowledge: DatosKnowledge;
  quickActions: DatosQuickActions;
  emptyState: DatosMensaje;
  error: DatosMensaje;
  loading: DatosMensaje;
  lista: DatosLista;
  metricas: DatosMetricas;
  irA: DatosIrA;
  recomendaciones: DatosRecomendaciones;
  insight: DatosInsight;
  movimientos: DatosMovimientos;
  rutina: DatosRutina;
  propuestaMovimiento: DatosPropuestaMovimiento;
  propuestaCambio: DatosPropuestaCambio;
}

export type DatosDe<K extends SectionKind> = DatosPorKind[K];

/**
 * Rompe la compilación si el catálogo y los datos se separan: un `kind` nuevo
 * sin tipo de datos, o un tipo de datos sin `kind`.
 */
export const CATALOGO_CUBIERTO: [SectionKind] extends [keyof DatosPorKind]
  ? [keyof DatosPorKind] extends [SectionKind]
    ? true
    : never
  : never = true;
