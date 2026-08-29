// Qué tareas son "mías" — lógica pura, sin React ni Supabase (probada en
// tests/domain/task-ownership.test.ts).
//
// POR QUÉ EXISTE
// Hasta la migración 0031, "mi tarea" era una tautología: todo proyecto era de
// su creador, así que bastaba con `projects.owner_id = auth.uid()`. Con los
// espacios de trabajo el acceso pasó a darse por MEMBRESÍA, y esa pregunta dejó
// de tener una respuesta obvia: en el espacio de un compañero hay tareas que me
// tocan y tareas que no, y ninguna de las dos es "de un proyecto mío".
//
// Home la necesita para no mentir en dos direcciones a la vez. Si se queda con
// el filtro viejo, el trabajo que me asignaron es invisible y sus minutos no
// cuentan para la saturación del día. Si se quita el filtro sin más, el trabajo
// de mis compañeros pasa a contar como mío. La regla vive aquí, separada de la
// consulta, porque es la parte que puede equivocarse.

export interface TaskOwnershipLike {
  id: string;
  projectId: string;
}

export interface OwnershipContext {
  /** Proyectos cuyo `owner_id` es el usuario. */
  myProjectIds: ReadonlySet<string>;
  /** Tareas donde el usuario figura como responsable. */
  assignedToMe: ReadonlySet<string>;
}

/**
 * Una tarea entra en mi día si está en un proyecto mío O si alguien me la
 * asignó. La unión, no la intersección: en mi propio proyecto no hace falta que
 * me asigne las tareas a mí mismo para que cuenten.
 *
 * Lo que deliberadamente NO entra: una tarea de un compañero, en el proyecto de
 * un compañero, dentro de un espacio que compartimos. La veo en /execution
 * porque tengo acceso al proyecto; no es mi trabajo.
 */
export function isMyTask(task: TaskOwnershipLike, ctx: OwnershipContext): boolean {
  return ctx.myProjectIds.has(task.projectId) || ctx.assignedToMe.has(task.id);
}

export function myTasks<T extends TaskOwnershipLike>(tasks: readonly T[], ctx: OwnershipContext): T[] {
  return tasks.filter((t) => isMyTask(t, ctx));
}

/**
 * Los nombres con los que figuro como responsable.
 *
 * `task_assignees.user_name` guarda un NOMBRE, no un id de usuario, así que
 * "yo" es un conjunto de nombres y no una identidad: el de cada una de mis
 * membresías (uno por espacio, y pueden diferir entre sí) más el del perfil.
 *
 * El del perfil es una red de seguridad, no un adorno: las cuentas anteriores a
 * la migración 0030 pueden no tener membresía Owner de su espacio personal, y
 * sin él sus tareas asignadas desaparecerían. Es la misma salvaguarda que ya
 * aplica el selector de responsables de /execution.
 *
 * Los nombres vacíos se descartan: un nombre en blanco casaría con cualquier
 * fila que también lo tenga en blanco, y se llevaría tareas ajenas por delante.
 */
export function myAssigneeNames(membershipNames: readonly string[], profileName: string | null | undefined): Set<string> {
  const names = new Set<string>();
  for (const name of membershipNames) if (name.trim()) names.add(name);
  if (profileName?.trim()) names.add(profileName);
  return names;
}

/** Ids de las tareas asignadas a alguno de mis nombres. */
export function tasksAssignedTo(rows: readonly { task_id: string; user_name: string }[], myNames: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) if (myNames.has(row.user_name)) ids.add(row.task_id);
  return ids;
}
