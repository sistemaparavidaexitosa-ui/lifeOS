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
  "loading"
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
  tareaContexto: 120
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

/** Precio y variación pueden faltar: la watchlist guarda QUÉ sigues, nunca CUÁNTO vale (D-184). */
export interface Posicion {
  simbolo: string;
  nombre: string;
  precio: number | null;
  variacionPct: number | null;
  nota: string | null;
}

export interface DatosPortfolio {
  moneda: string;
  total: number | null;
  variacionPct: number | null;
  posiciones: Posicion[];
}

export interface DatosWatchlist {
  /** `false` = falta la llave de mercado; la sección lo dice en vez de enseñar ceros. */
  configurado: boolean;
  simbolos: Posicion[];
}

export interface DatosChart {
  unidad: string;
  serie: { x: string; y: number }[];
}

export interface DatosTimeline {
  hitos: { fechaISO: string; titulo: string; estado: "hecho" | "pendiente" | "riesgo" }[];
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

export interface DatosCards {
  items: { titulo: string; detalle: string; href: string | null }[];
}

export interface DatosTable {
  columnas: string[];
  filas: string[][];
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
