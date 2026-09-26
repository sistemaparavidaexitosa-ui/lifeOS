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
}

export interface EntradaDeEscritura {
  dominio: Domain;
  /** Cómo se llama una fila en la tarjeta: «Tarea». */
  etiqueta: string;
  /** Una línea para el índice del prompt. */
  descripcion: string;
  operaciones: readonly Operacion[];
  /** El campo que titula la tarjeta. */
  titulo: string;
  campos: Record<string, CampoDeEscritura>;
}

const ESTADOS_DE_TAREA = ["Pending", "InProgress", "Blocked", "Rescheduled", "Completed", "Cancelled"] as const;
const PRIORIDADES = ["High", "Medium", "Low"] as const;
const COMIDAS = ["Desayuno", "Almuerzo", "Cena", "Snack"] as const;

export const ESCRITURA_POR_TABLA = {
  tasks: {
    dominio: "execution",
    etiqueta: "Tarea",
    descripcion: "tareas de un proyecto (crear en un proyecto leído, cambiar estado/prioridad/fecha, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    titulo: "title",
    campos: {
      project_id: { etiqueta: "Proyecto", tipo: "ref", refTabla: "projects", obligatorio: true, soloCrear: true },
      title: { etiqueta: "Título", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      status: { etiqueta: "Estado", tipo: "opcion", opciones: ESTADOS_DE_TAREA, soloEditar: true },
      priority: { etiqueta: "Prioridad", tipo: "opcion", opciones: PRIORIDADES },
      due: { etiqueta: "Vence", tipo: "fecha" },
      est: { etiqueta: "Minutos estimados", tipo: "entero", min: 0, max: 1440, soloCrear: true }
    }
  },
  notes: {
    dominio: "execution",
    etiqueta: "Nota",
    descripcion: "notas de un cuaderno (crear en un cuaderno leído, reescribir título o cuerpo, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    titulo: "title",
    campos: {
      notebook_id: { etiqueta: "Cuaderno", tipo: "ref", refTabla: "notebooks", obligatorio: true, soloCrear: true },
      title: { etiqueta: "Título", tipo: "texto", min: 0, max: 300 },
      body: { etiqueta: "Texto", tipo: "texto", obligatorio: true, min: 1, max: 20000 }
    }
  },
  food_entries: {
    dominio: "nutrition",
    etiqueta: "Comida",
    descripcion: "lo que comió la persona (registrar con macros por 100 g, corregir comida/nombre/gramos, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    titulo: "name",
    campos: {
      local_date: { etiqueta: "Día", tipo: "fecha", soloCrear: true },
      meal: { etiqueta: "Comida", tipo: "opcion", opciones: COMIDAS, obligatorio: true },
      name: { etiqueta: "Alimento", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      grams: { etiqueta: "Gramos", tipo: "numero", obligatorio: true, min: 0.1, max: 5000 },
      kcal100: { etiqueta: "kcal por 100 g", tipo: "numero", obligatorio: true, min: 0, max: 900, soloCrear: true },
      protein100: { etiqueta: "Proteína por 100 g", tipo: "numero", min: 0, max: 100, soloCrear: true },
      carbs100: { etiqueta: "Carbohidratos por 100 g", tipo: "numero", min: 0, max: 100, soloCrear: true },
      fat100: { etiqueta: "Grasa por 100 g", tipo: "numero", min: 0, max: 100, soloCrear: true }
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
