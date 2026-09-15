// GENERADO por scripts/gen-graph-catalog.mjs — NO EDITAR A MANO.
//
// Fuente: `graph_node_types`, `graph_rel_types` y `graph_sources` de la base.
// Regenerar con `pnpm gen:graph-catalog` después de tocar el catálogo.
//
// Aquí solo baja lo que la base posee: las palabras y la semántica. La
// geometría —radios, grosores, líneas discontinuas— vive en `theme.ts`, y va
// indexada por los tipos de este archivo, así que un tipo nuevo en la base
// rompe la compilación hasta que alguien decida cómo se dibuja.

/** Los tipos de nodo del catálogo, en el orden en que los enseña la interfaz. */
export const NODE_CATALOG = {
  workspace: { label: "Espacio", plural: "espacios", colorVar: "--accent", proyectado: true },
  project: { label: "Proyecto", plural: "proyectos", colorVar: "--c-purple", proyectado: true },
  task: { label: "Tarea", plural: "tareas", colorVar: "--c-purple", proyectado: true },
  goal: { label: "Meta", plural: "metas", colorVar: "--c-orange", proyectado: true },
  identity_trait: { label: "Rasgo de identidad", plural: "rasgos de identidad", colorVar: "--c-orange", proyectado: true },
  habit: { label: "Hábito", plural: "hábitos", colorVar: "--c-orange", proyectado: true },
  routine: { label: "Rutina", plural: "rutinas", colorVar: "--c-orange", proyectado: true },
  book: { label: "Libro", plural: "libros", colorVar: "--c-orange", proyectado: true },
  notebook: { label: "Cuaderno", plural: "cuadernos", colorVar: "--c-blue", proyectado: true },
  note: { label: "Nota", plural: "notas", colorVar: "--c-blue", proyectado: true },
  document: { label: "Documento", plural: "documentos", colorVar: "--c-blue", proyectado: true },
  decision: { label: "Decisión", plural: "decisiones", colorVar: "--c-blue", proyectado: true },
  person: { label: "Persona", plural: "personas", colorVar: "--c-pink", proyectado: true },
  account: { label: "Cuenta", plural: "cuentas", colorVar: "--c-green", proyectado: true },
  investment: { label: "Inversión", plural: "inversiones", colorVar: "--c-green", proyectado: true },
  debt: { label: "Deuda", plural: "deudas", colorVar: "--danger", proyectado: true },
  budget: { label: "Presupuesto", plural: "presupuestos", colorVar: "--c-green", proyectado: true },
  financial_goal: { label: "Meta financiera", plural: "metas financieras", colorVar: "--c-green", proyectado: true },
  asset: { label: "Activo", plural: "activos", colorVar: "--c-green", proyectado: true },
  liability: { label: "Pasivo", plural: "pasivos", colorVar: "--danger", proyectado: true },
  ai_conversation: { label: "Conversación IA", plural: "conversaciones", colorVar: "--c-teal", proyectado: false },
  meeting: { label: "Reunión", plural: "reuniones", colorVar: "--c-pink", proyectado: false },
  risk: { label: "Riesgo", plural: "riesgos", colorVar: "--danger", proyectado: false },
  custom: { label: "Nodo propio", plural: "nodos", colorVar: "--muted", proyectado: false },
} as const;

/** Las relaciones del catálogo. `invertida` es lo que hace funcionar el Mapa de impacto. */
export const REL_CATALOG = {
  depends_on: { label: "depende de", dependencia: true, invertida: true, simetrica: false },
  blocks: { label: "bloquea a", dependencia: true, invertida: false, simetrica: false },
  leads_to: { label: "lleva a", dependencia: true, invertida: false, simetrica: false },
  caused_by: { label: "causado por", dependencia: true, invertida: true, simetrica: false },
  child_of: { label: "es parte de", dependencia: false, invertida: true, simetrica: false },
  parent_of: { label: "contiene a", dependencia: false, invertida: false, simetrica: false },
  belongs_to: { label: "pertenece a", dependencia: false, invertida: true, simetrica: false },
  supports: { label: "apoya a", dependencia: false, invertida: false, simetrica: false },
  references: { label: "referencia a", dependencia: false, invertida: false, simetrica: false },
  created_from: { label: "salió de", dependencia: false, invertida: true, simetrica: false },
  generated_by_ai: { label: "generado por IA", dependencia: false, invertida: true, simetrica: false },
  assigned_to: { label: "asignado a", dependencia: false, invertida: false, simetrica: false },
  related_to: { label: "relacionado con", dependencia: false, invertida: false, simetrica: true },
  duplicates: { label: "duplica a", dependencia: false, invertida: false, simetrica: true },
} as const;

/** De la tabla del dominio a la pantalla donde vive. `{id}` es el único marcador. */
export const ROUTE_TEMPLATES = {
  accounts: "/money",
  assets: "/wealth",
  books: "/development/library",
  budgets: "/money/budget",
  debts: "/debt",
  financial_goals: "/goals",
  habits: "/development/routines",
  identity_traits: "/development/routines",
  investments: "/investments",
  liabilities: "/wealth",
  logbook: "/execution",
  memberships: "/execution",
  notebooks: "/notebooks",
  notes: "/notebooks",
  personal_goals: "/development/goals",
  projects: "/execution?project={id}",
  routines: "/development/routines",
  savings_goals: "/savings",
  task_files: "/execution",
  tasks: "/execution",
  workspaces: "/execution",
} as const;
