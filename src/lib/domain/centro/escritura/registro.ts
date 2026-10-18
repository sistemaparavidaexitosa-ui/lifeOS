// Lo que el Centro puede ESCRIBIR (D-203). Puro, probado en
// tests/domain/centro-escritura-registro.test.ts.
//
// ES LA LISTA BLANCA DE ESCRITURA, como `TABLAS_CONSULTABLES` lo es de
// lectura: un solo archivo que auditar. Una tabla que no está aquí no se
// propone; un campo que no está aquí se ignora. Añadir una tabla = una entrada
// aquí + su adaptador en `src/lib/centro/escritura/adaptadores.ts` (el tipo
// de ADAPTADORES rompe `tsc` si falta alguno).
//
// NUNCA ENTRAN las de TABLAS_PROHIBIDAS. `profiles` la primera: ahí vive
// `ai_domains`, y un agente que pudiera escribirla ampliaría sus propios
// permisos.

import type { Domain } from "../../insights/types.ts";
import { TASK_TRANSITIONS } from "../../task-state.ts";

export const OPERACIONES = ["crear", "editar", "borrar"] as const;
export type Operacion = (typeof OPERACIONES)[number];

export type TipoCampo = "texto" | "numero" | "entero" | "fecha" | "opcion" | "ref";

export interface CampoDeEscritura {
  etiqueta: string;
  tipo: TipoCampo;
  /** Obligatorio AL CREAR. Al editar nada es obligatorio: viaja lo que cambia. */
  obligatorio?: boolean;
  /** Texto: longitud. Número: rango. */
  min?: number;
  max?: number;
  opciones?: readonly string[];
  /** `ref`: la fila tiene que ser de esta tabla y leída en el turno. */
  refTabla?: string;
  soloCrear?: boolean;
  soloEditar?: boolean;
  /**
   * D-205, `opcion`: las palabras con que la persona dice cada valor
   * («urgente» → `High`). Ya normalizadas (sin acentos, minúsculas).
   */
  sinonimos?: Readonly<Record<string, readonly string[]>>;
  /** D-205, `numero`/`entero`: las unidades que lo acompañan («80 g»). */
  unidades?: readonly string[];
  /** D-205, `numero`/`entero`: las palabras que lo anuncian («saldo 4500»). */
  etiquetas?: readonly string[];
  /** D-205, `ref`: cómo se nombra el destino («en el proyecto …»). */
  menciones?: readonly string[];
  /** D-205, `ref`: la columna con el nombre de la fila destino. Por defecto, `title`. */
  refTitulo?: string;
  /**
   * D-205: lo que pone el intérprete al CREAR si no se dijo, como el valor
   * inicial de su formulario. `"hoy"` en una fecha es el día de la persona.
   */
  porDefecto?: string | number;
  /**
   * D-205, `opcion`: a qué valores se puede pasar desde cada uno. Es la regla
   * de la sección (p. ej. la máquina de estados de tareas): el intérprete no
   * propone un salto que la server action va a rechazar al pulsar Guardar.
   */
  transiciones?: Readonly<Record<string, readonly string[]>>;
}

export interface EntradaDeEscritura {
  dominio: Domain;
  /** Cómo se llama una fila en la tarjeta: «Tarea». */
  etiqueta: string;
  /** Una línea para el índice del prompt. */
  descripcion: string;
  operaciones: readonly Operacion[];
  /**
   * D-205: cómo llama la persona a una fila de esta tabla («tarea»). Lo usa
   * el intérprete; ya normalizado, y ninguno puede estar en dos tablas (test).
   */
  sinonimos: readonly string[];
  /** El campo que titula la tarjeta. */
  titulo: string;
  /** D-205: «la» y «ninguna» (por defecto: si `etiqueta` acaba en -a). */
  femenino?: boolean;
  /** D-205: cómo dice «Entendí» el crear («Registrar el hábito…»). Por defecto, «Crear». */
  accion?: string;
  /**
   * D-205: verbos que en ESTA tabla son crear aunque en general sean editar:
   * marcar un hábito es crear su registro del día.
   */
  crearCon?: readonly string[];
  /**
   * D-205: dónde pone el intérprete lo que se dictó al crear. Por defecto,
   * `titulo`; en una nota es el cuerpo (el título es opcional y el cuerpo no).
   * Si es un `ref`, lo dictado es el NOMBRE de esa fila («marca el hábito
   * meditar»: `habit_id` = el hábito que se llame así).
   */
  dictado?: string;
  campos: Record<string, CampoDeEscritura>;
}

const ESTADOS_DE_TAREA = ["Pending", "InProgress", "Blocked", "Rescheduled", "Completed", "Cancelled"] as const;
const PRIORIDADES = ["High", "Medium", "Low"] as const;
const COMIDAS = ["Desayuno", "Almuerzo", "Cena", "Snack"] as const;

// El PRIMER sinónimo de cada valor es también como se lee en «Entendí: …».
const SINONIMOS_DE_ESTADO = {
  Completed: ["completada", "completado", "hecha", "hecho", "terminada", "terminado", "lista", "listo"],
  InProgress: ["en progreso", "empezada", "en curso"],
  Blocked: ["bloqueada", "bloqueado"],
  Rescheduled: ["reprogramada", "reprogramado"],
  Cancelled: ["cancelada", "cancelado"],
  Pending: ["pendiente"]
} as const;
const SINONIMOS_DE_PRIORIDAD = {
  High: ["alta", "urgente", "prioridad alta", "alta prioridad", "importante"],
  Medium: ["media", "prioridad media", "normal"],
  Low: ["baja", "prioridad baja", "baja prioridad"]
} as const;
const SINONIMOS_DE_COMIDA = {
  Desayuno: ["desayuno"],
  Almuerzo: ["almuerzo", "comida del mediodia"],
  Cena: ["cena"],
  Snack: ["snack", "colacion", "merienda", "botana"]
} as const;

// E2 (D-205). Los valores son los de cada formulario y su zod; los sinónimos,
// cómo los dice la persona. Una palabra que es a la vez opción de un campo y
// sinónimo de otra tabla («activo») la resuelve `analizar`: gana el campo.
const ESTADOS_DE_PROYECTO = ["Draft", "Active", "OnHold", "Completed", "Cancelled", "Archived"] as const;
const SINONIMOS_DE_ESTADO_DE_PROYECTO = {
  Active: ["activo", "activa", "en marcha"],
  OnHold: ["en pausa", "pausado", "pausada", "detenido"],
  Completed: ["completado", "terminado", "hecho", "cerrado"],
  Cancelled: ["cancelado"],
  Archived: ["archivado"],
  Draft: ["borrador"]
} as const;
const ESTADOS_DE_HABITO = ["completed", "skipped", "postponed"] as const;
const SINONIMOS_DE_ESTADO_DE_HABITO = {
  completed: ["hecho", "hecha", "completado", "completada", "cumplido", "listo"],
  skipped: ["omitido", "omitida", "saltado", "no lo hice"],
  postponed: ["pospuesto", "pospuesta", "aplazado"]
} as const;
const AREAS = ["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"] as const;
const SINONIMOS_DE_AREA = {
  Salud: ["salud", "area salud", "area de salud"],
  Carrera: ["carrera", "area carrera", "area de carrera", "trabajo"],
  Relaciones: ["relaciones", "area relaciones", "area de relaciones"],
  Finanzas: ["finanzas", "area finanzas", "area de finanzas"],
  Aprendizaje: ["aprendizaje", "area aprendizaje", "area de aprendizaje"],
  Espiritual: ["espiritual", "area espiritual"],
  Personal: ["personal", "area personal"]
} as const;
const ESTADOS_DE_META = ["Activa", "Pausada", "Lograda", "Abandonada"] as const;
const SINONIMOS_DE_ESTADO_DE_META = {
  Activa: ["activa"],
  Pausada: ["pausada", "en pausa"],
  Lograda: ["lograda", "cumplida", "conseguida"],
  Abandonada: ["abandonada"]
} as const;
const ESTADOS_DE_LIBRO = ["Por leer", "Leyendo", "Terminado"] as const;
const SINONIMOS_DE_ESTADO_DE_LIBRO = {
  "Por leer": ["por leer"],
  Leyendo: ["leyendo", "empezado"],
  Terminado: ["terminado", "leido", "acabado"]
} as const;
const TIPOS_DE_AHORRO = ["Emergencia", "Viajes", "Casa", "Empresa", "Automóvil", "Impuestos", "Jubilación"] as const;
// Sin «casa» ni «auto» sueltos: se comerían el nombre de la meta («Enganche
// de la casa»). Lo que no se dice queda en Emergencia, como en el formulario,
// y la tarjeta deja corregirlo.
const SINONIMOS_DE_TIPO_DE_AHORRO = {
  Emergencia: ["emergencia", "emergencias", "fondo de emergencia"],
  Viajes: ["viajes", "para viajes"],
  Casa: ["para la casa"],
  Empresa: ["para la empresa"],
  "Automóvil": ["para el auto", "para el coche"],
  Impuestos: ["impuestos"],
  "Jubilación": ["jubilacion", "retiro"]
} as const;
const TIPOS_DE_ACTIVO = ["Efectivo", "Bancos", "Inversión", "Bien inmueble", "Vehículo", "Negocio", "Otros"] as const;
const SINONIMOS_DE_TIPO_DE_ACTIVO = {
  Efectivo: ["efectivo"],
  Bancos: ["bancos", "cuenta bancaria"],
  "Bien inmueble": ["inmueble", "bien inmueble"],
  "Vehículo": ["vehiculo"],
  Negocio: ["negocio"]
} as const;
const PESOS = ["pesos", "mxn"];

export const ESCRITURA_POR_TABLA = {
  tasks: {
    dominio: "execution",
    etiqueta: "Tarea",
    descripcion: "tareas de un proyecto (crear en un proyecto leído, cambiar estado/prioridad/fecha, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["tarea", "tareas"],
    titulo: "title",
    campos: {
      project_id: {
        etiqueta: "Proyecto",
        tipo: "ref",
        refTabla: "projects",
        obligatorio: true,
        soloCrear: true,
        menciones: ["en el proyecto", "al proyecto", "del proyecto", "en proyecto"]
      },
      title: { etiqueta: "Título", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      status: { etiqueta: "Estado", tipo: "opcion", opciones: ESTADOS_DE_TAREA, soloEditar: true, sinonimos: SINONIMOS_DE_ESTADO, transiciones: TASK_TRANSITIONS },
      priority: { etiqueta: "Prioridad", tipo: "opcion", opciones: PRIORIDADES, sinonimos: SINONIMOS_DE_PRIORIDAD },
      due: { etiqueta: "Vence", tipo: "fecha" },
      est: { etiqueta: "Minutos estimados", tipo: "entero", min: 0, max: 1440, soloCrear: true, unidades: ["min", "minutos"] }
    }
  },
  notes: {
    dominio: "execution",
    etiqueta: "Nota",
    descripcion: "notas de un cuaderno (crear en un cuaderno leído, reescribir título o cuerpo, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["nota", "notas", "idea", "apunte"],
    titulo: "title",
    dictado: "body",
    campos: {
      notebook_id: {
        etiqueta: "Cuaderno",
        tipo: "ref",
        refTabla: "notebooks",
        obligatorio: true,
        soloCrear: true,
        menciones: ["en el cuaderno", "al cuaderno", "en la libreta", "en cuaderno"]
      },
      title: { etiqueta: "Título", tipo: "texto", min: 0, max: 300 },
      body: { etiqueta: "Texto", tipo: "texto", obligatorio: true, min: 1, max: 20000 }
    }
  },
  food_entries: {
    dominio: "nutrition",
    etiqueta: "Comida",
    descripcion: "lo que comió la persona (registrar con macros por 100 g, corregir comida/nombre/gramos, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["comida", "comidas", "alimento"],
    titulo: "name",
    campos: {
      local_date: { etiqueta: "Día", tipo: "fecha", soloCrear: true, porDefecto: "hoy" },
      meal: { etiqueta: "Comida", tipo: "opcion", opciones: COMIDAS, obligatorio: true, sinonimos: SINONIMOS_DE_COMIDA },
      name: { etiqueta: "Alimento", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      grams: { etiqueta: "Gramos", tipo: "numero", obligatorio: true, min: 0.1, max: 5000, unidades: ["g", "gr", "grs", "gramos"] },
      kcal100: { etiqueta: "kcal por 100 g", tipo: "numero", obligatorio: true, min: 0, max: 900, soloCrear: true },
      protein100: { etiqueta: "Proteína por 100 g", tipo: "numero", min: 0, max: 100, soloCrear: true },
      carbs100: { etiqueta: "Carbohidratos por 100 g", tipo: "numero", min: 0, max: 100, soloCrear: true },
      fat100: { etiqueta: "Grasa por 100 g", tipo: "numero", min: 0, max: 100, soloCrear: true }
    }
  },
  projects: {
    dominio: "execution",
    etiqueta: "Proyecto",
    descripcion: "proyectos (crear en el espacio personal, cambiar título/estado/prioridad/fecha objetivo, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["proyecto", "proyectos"],
    titulo: "title",
    campos: {
      title: { etiqueta: "Título", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      status: { etiqueta: "Estado", tipo: "opcion", opciones: ESTADOS_DE_PROYECTO, sinonimos: SINONIMOS_DE_ESTADO_DE_PROYECTO },
      priority: { etiqueta: "Prioridad", tipo: "opcion", opciones: PRIORIDADES, sinonimos: SINONIMOS_DE_PRIORIDAD },
      target_date: { etiqueta: "Fecha objetivo", tipo: "fecha" }
    }
  },
  habit_logs: {
    dominio: "habits",
    etiqueta: "Hábito",
    descripcion: "el registro de un hábito en un día (hecho, omitido o pospuesto; hoy o hasta 7 días atrás)",
    operaciones: ["crear"],
    sinonimos: ["habito", "habitos"],
    titulo: "habit_id",
    dictado: "habit_id",
    accion: "Registrar",
    crearCon: ["marca", "marcame", "marcar", "pon", "ponle"],
    campos: {
      habit_id: { etiqueta: "Hábito", tipo: "ref", refTabla: "habits", refTitulo: "name", obligatorio: true },
      log_date: { etiqueta: "Día", tipo: "fecha", obligatorio: true, porDefecto: "hoy" },
      status: { etiqueta: "Estado", tipo: "opcion", opciones: ESTADOS_DE_HABITO, obligatorio: true, sinonimos: SINONIMOS_DE_ESTADO_DE_HABITO, porDefecto: "completed" }
    }
  },
  reminders: {
    dominio: "execution",
    etiqueta: "Recordatorio",
    descripcion: "un recordatorio privado sobre una tarea leída, para un día",
    operaciones: ["crear"],
    sinonimos: ["recordatorio", "recordatorios"],
    titulo: "subject_id",
    dictado: "subject_id",
    crearCon: ["pon", "ponme"],
    campos: {
      subject_id: { etiqueta: "Tarea", tipo: "ref", refTabla: "tasks", obligatorio: true, menciones: ["de la tarea", "sobre la tarea", "para la tarea"] },
      remind_on: { etiqueta: "Día", tipo: "fecha", obligatorio: true },
      text: { etiqueta: "Nota", tipo: "texto", min: 0, max: 300 }
    }
  },
  personal_goals: {
    dominio: "growth",
    etiqueta: "Meta personal",
    femenino: true,
    descripcion: "metas personales (crear con área, cambiar título/área/estado/horizonte, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["meta personal", "metas personales", "meta", "metas", "objetivo personal", "proposito"],
    titulo: "title",
    campos: {
      title: { etiqueta: "Título", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      description: { etiqueta: "Descripción", tipo: "texto", min: 0, max: 2000 },
      area: { etiqueta: "Área", tipo: "opcion", opciones: AREAS, obligatorio: true, sinonimos: SINONIMOS_DE_AREA, porDefecto: "Personal" },
      status: { etiqueta: "Estado", tipo: "opcion", opciones: ESTADOS_DE_META, obligatorio: true, sinonimos: SINONIMOS_DE_ESTADO_DE_META, porDefecto: "Activa" },
      horizon: { etiqueta: "Horizonte", tipo: "fecha" }
    }
  },
  books: {
    dominio: "growth",
    etiqueta: "Libro",
    descripcion: "libros de la biblioteca (agregar, cambiar estado o página actual, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["libro", "libros"],
    titulo: "title",
    campos: {
      title: { etiqueta: "Título", tipo: "texto", obligatorio: true, min: 1, max: 300 },
      author: { etiqueta: "Autor", tipo: "texto", min: 0, max: 200 },
      status: { etiqueta: "Estado", tipo: "opcion", opciones: ESTADOS_DE_LIBRO, obligatorio: true, sinonimos: SINONIMOS_DE_ESTADO_DE_LIBRO, porDefecto: "Por leer" },
      current_page: { etiqueta: "Página actual", tipo: "entero", min: 0, max: 100000, etiquetas: ["pagina", "pag", "voy en la pagina"] },
      total_pages: { etiqueta: "Páginas", tipo: "entero", min: 0, max: 100000, unidades: ["paginas", "pags"] }
    }
  },
  savings_goals: {
    dominio: "money",
    etiqueta: "Meta de ahorro",
    femenino: true,
    descripcion: "metas de ahorro (crear con monto objetivo, cambiar monto/ahorrado/aportación mensual/fecha, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["meta de ahorro", "metas de ahorro", "ahorro", "ahorros", "alcancia", "fondo de ahorro"],
    titulo: "name",
    campos: {
      name: { etiqueta: "Nombre", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      type: { etiqueta: "Tipo", tipo: "opcion", opciones: TIPOS_DE_AHORRO, obligatorio: true, sinonimos: SINONIMOS_DE_TIPO_DE_AHORRO, porDefecto: "Emergencia" },
      target: { etiqueta: "Objetivo", tipo: "numero", obligatorio: true, min: 0, max: 1e12, unidades: PESOS, etiquetas: ["objetivo", "meta de", "monto"] },
      current_amount: { etiqueta: "Ahorrado", tipo: "numero", obligatorio: true, min: 0, max: 1e12, etiquetas: ["ahorrado", "llevo", "tengo"], porDefecto: 0 },
      monthly: { etiqueta: "Aportación mensual", tipo: "numero", obligatorio: true, min: 0, max: 1e12, etiquetas: ["mensual", "al mes", "aportacion"], unidades: ["al mes", "mensuales", "por mes"], porDefecto: 0 },
      target_date: { etiqueta: "Fecha objetivo", tipo: "fecha" },
      priority: { etiqueta: "Prioridad", tipo: "opcion", opciones: PRIORIDADES, obligatorio: true, sinonimos: SINONIMOS_DE_PRIORIDAD, porDefecto: "Medium" }
    }
  },
  financial_goals: {
    dominio: "money",
    etiqueta: "Meta financiera",
    femenino: true,
    descripcion: "metas financieras (crear con monto objetivo, cambiar monto/acumulado/horizonte/prioridad, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["meta financiera", "metas financieras", "objetivo financiero"],
    titulo: "name",
    campos: {
      name: { etiqueta: "Nombre", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      target: { etiqueta: "Objetivo", tipo: "numero", obligatorio: true, min: 0, max: 1e12, unidades: PESOS, etiquetas: ["objetivo", "monto"] },
      current_amount: { etiqueta: "Acumulado", tipo: "numero", obligatorio: true, min: 0, max: 1e12, etiquetas: ["acumulado", "llevo", "tengo"], porDefecto: 0 },
      horizon: { etiqueta: "Horizonte", tipo: "fecha" },
      priority: { etiqueta: "Prioridad", tipo: "opcion", opciones: PRIORIDADES, obligatorio: true, sinonimos: SINONIMOS_DE_PRIORIDAD, porDefecto: "Medium" }
    }
  },
  debts: {
    dominio: "debt",
    etiqueta: "Deuda",
    descripcion: "deudas (registrar con saldo, tasa, pago mínimo y día de corte; cambiar cualquiera; borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["deuda", "deudas", "prestamo", "credito"],
    titulo: "name",
    campos: {
      name: { etiqueta: "Nombre", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      balance: { etiqueta: "Saldo", tipo: "numero", obligatorio: true, min: 0, max: 1e12, unidades: PESOS, etiquetas: ["saldo", "debo"] },
      rate: { etiqueta: "Tasa anual %", tipo: "numero", obligatorio: true, min: 0, max: 1000, unidades: ["%", "por ciento"], etiquetas: ["tasa"] },
      min_payment: { etiqueta: "Pago mínimo", tipo: "numero", obligatorio: true, min: 0, max: 1e12, etiquetas: ["pago minimo", "minimo"] },
      due_day: { etiqueta: "Día de pago", tipo: "entero", obligatorio: true, min: 1, max: 28, etiquetas: ["dia de pago", "dia de corte", "dia"] }
    }
  },
  assets: {
    dominio: "money",
    etiqueta: "Activo",
    descripcion: "activos del patrimonio (registrar con valuación, fecha y fuente; revaluar; borrar)",
    operaciones: ["crear", "editar", "borrar"],
    sinonimos: ["activo", "activos", "propiedad", "propiedades"],
    titulo: "name",
    campos: {
      name: { etiqueta: "Nombre", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      kind: { etiqueta: "Tipo", tipo: "opcion", opciones: TIPOS_DE_ACTIVO, obligatorio: true, sinonimos: SINONIMOS_DE_TIPO_DE_ACTIVO, porDefecto: "Otros" },
      value: { etiqueta: "Valor", tipo: "numero", obligatorio: true, min: 0, max: 1e13, unidades: PESOS, etiquetas: ["valor", "vale", "valuado en", "valuacion"] },
      as_of: { etiqueta: "Fecha de valuación", tipo: "fecha", obligatorio: true, porDefecto: "hoy" },
      source: { etiqueta: "Fuente", tipo: "texto", obligatorio: true, min: 1, max: 200, porDefecto: "Estimación" }
    }
  },
  logbook: {
    dominio: "execution",
    etiqueta: "Aprendizaje",
    descripcion: "un aprendizaje en la bitácora",
    operaciones: ["crear"],
    sinonimos: ["bitacora", "leccion aprendida"],
    titulo: "text",
    accion: "Anotar",
    campos: {
      text: { etiqueta: "Texto", tipo: "texto", obligatorio: true, min: 1, max: 2000 }
    }
  },
  daily_reflections: {
    dominio: "growth",
    etiqueta: "Reflexión del día",
    femenino: true,
    descripcion: "el check-in de HOY (ánimo y energía 1-5, horas de sueño, reflexión, logros); lo que no viaja se conserva",
    operaciones: ["crear"],
    sinonimos: ["reflexion", "reflexion del dia", "check in"],
    titulo: "reflection",
    accion: "Registrar",
    campos: {
      reflection: { etiqueta: "Reflexión", tipo: "texto", min: 0, max: 2000 },
      wins: { etiqueta: "Logros", tipo: "texto", min: 0, max: 1000 },
      mood: { etiqueta: "Ánimo", tipo: "entero", min: 1, max: 5, etiquetas: ["animo", "humor"] },
      energy: { etiqueta: "Energía", tipo: "entero", min: 1, max: 5, etiquetas: ["energia"] },
      sleep_hours: { etiqueta: "Horas de sueño", tipo: "numero", min: 0, max: 24, unidades: ["horas", "h"], etiquetas: ["dormi", "sueno"] }
    }
  }
} as const satisfies Record<string, EntradaDeEscritura>;

export type TablaEscribible = keyof typeof ESCRITURA_POR_TABLA;

/**
 * Lo que el Centro no escribe NUNCA. No es la lista de «lo que falta»: es la
 * de lo que no debe llegar. Sistema, derivadas, colas y todo lo que decide
 * quién ve qué.
 */
export const TABLAS_PROHIBIDAS: readonly string[] = [
  "profiles",
  "workspaces",
  "memberships",
  "invitations",
  "project_shares",
  "audit_log",
  "consents",
  "graph_edges",
  "graph_nodes",
  "graph_edge_rules",
  "graph_layouts",
  "graph_node_types",
  "graph_rel_types",
  "graph_sources",
  "identity_scores",
  "identity_briefs",
  "identity_revisions",
  "identity_brief_style",
  "net_worth_snapshots",
  "task_history",
  "workspace_activity",
  "ai_chat_messages",
  "ai_job_runs",
  "automation_runs",
  "routine_runs",
  "ritual_runs",
  "centro_runs",
  "coach_proposals",
  "recommendations",
  "notifications",
  "push_subscriptions",
  "nav_visitas",
  "comment_reads",
  "template_catalog",
  "ritual_policy",
  "ritual_prefs",
  "notification_prefs",
  "automations",
  "task_files"
];

/**
 * La entrada de una tabla si se puede escribir con estos dominios, o `null`.
 * Como `tablaConsultable`: «no existe» y «no autorizada» no se distinguen.
 */
export function entradaDe(
  tabla: string,
  autorizados: readonly Domain[]
): (EntradaDeEscritura & { tabla: TablaEscribible }) | null {
  const e = (ESCRITURA_POR_TABLA as Record<string, EntradaDeEscritura | undefined>)[tabla];
  if (!e || !autorizados.includes(e.dominio)) return null;
  return { ...e, tabla: tabla as TablaEscribible };
}

/** Los campos que una operación puede tocar. */
export function camposDe(entrada: EntradaDeEscritura, operacion: "crear" | "editar"): [string, CampoDeEscritura][] {
  return Object.entries(entrada.campos).filter(([, c]) => (operacion === "crear" ? !c.soloEditar : !c.soloCrear));
}
