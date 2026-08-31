// src/lib/domain/execution/activity.ts
// El feed del espacio — lógica pura, sin React ni Supabase (probada en
// tests/domain/execution-activity.test.ts).

/** Una fila de `workspace_activity`, ya traducida a la forma que se pinta. */
export interface ActivityEntry {
  id: string;
  type: string;
  text: string;
  actor: string;
  /** ISO con hora. */
  at: string;
  projectId: string | null;
}

export interface ActivityDay {
  /** `yyyy-mm-dd`. */
  dateISO: string;
  entries: ActivityEntry[];
}

/**
 * Cómo se lee cada tipo de evento.
 *
 * `workspace_activity.type` es TEXTO LIBRE en el esquema (0003): no hay `check`
 * que lo acote, así que cualquier Server Action futura puede escribir un tipo
 * que aquí no esté. Por eso el desconocido se devuelve tal cual en vez de
 * caer en un «Otro» que borraría la única pista de qué pasó.
 */
const TYPE_LABEL: Record<string, string> = {
  comment: "Comentario",
  // El mensaje escrito en el hilo de un PROYECTO. Tipo aparte para que ese
  // hilo pueda excluirlo al pintarse sin adivinar por el texto; aquí se lee
  // igual que cualquier comentario.
  "comment.project": "Comentario",
  "task.create": "Tarea",
  "task.status": "Estado",
  "task.assign": "Responsables",
  "task.delete": "Tarea borrada",
  "project.create": "Proyecto",
  "project.update": "Proyecto",
  "project.delete": "Proyecto borrado",
  "group.create": "Grupo",
  "group.rename": "Grupo",
  "group.delete": "Grupo borrado",
  "template.apply": "Plantilla",
  // El plan generado con IA escribe por el mismo camino que una plantilla
  // (`writeTemplate`), pero se etiqueta aparte: en el feed importa distinguir
  // los grupos que eligió una persona de los que propuso el modelo.
  "ai.plan": "Plan con IA",
  share: "Compartido",
  // Las dos claves del mismo evento: la Server Action escribe `move` desde
  // 0003 y esta tabla decía `project.move`, así que el feed llevaba enseñando
  // «move» en crudo. Se mapean ambas en vez de reescribir las filas ya
  // guardadas — mismo criterio que 0037 tomó con `comments.mentions`.
  move: "Movido",
  "project.move": "Movido",
  "member.invite": "Invitación",
  "member.remove": "Baja"
};

export function activityLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

/**
 * Agrupa por día, del más reciente al más antiguo y con las entradas de cada
 * día también descendentes.
 *
 * El corte por día se hace sobre la fecha LOCAL de quien mira, no sobre el
 * prefijo del ISO: un comentario de las 19:00 en Ciudad de México se guarda
 * como la 01:00 UTC del día siguiente, y cortando por texto aparecería bajo
 * «mañana». Es el mismo error que la migración 0016 arregló en las ocupaciones.
 */
export function groupByDay(entries: readonly ActivityEntry[]): ActivityDay[] {
  const ordered = [...entries].sort((a, b) => b.at.localeCompare(a.at));

  const days: ActivityDay[] = [];
  const index = new Map<string, ActivityDay>();

  for (const entry of ordered) {
    const local = new Date(entry.at);
    if (Number.isNaN(local.getTime())) continue;
    const dateISO = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;

    let day = index.get(dateISO);
    if (!day) {
      day = { dateISO, entries: [] };
      index.set(dateISO, day);
      days.push(day);
    }
    day.entries.push(entry);
  }

  return days;
}
