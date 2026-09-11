// Las dependencias entre proyectos.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// `projects.dependencies` lleva en la base desde 0003 y es una columna de TEXTO
// LIBRE: prosa que una persona escribe y que ningún programa puede recorrer.
// Con eso, «¿qué proyectos bloquea este?» era incontestable, y el grafo no
// podía dibujar una relación que solo existía como frase dentro de un campo.
// `projects.depends_on uuid[]` la convierte en un dato, igual que `tasks.deps`.
//
// LA COLUMNA DE TEXTO NO SE MIGRA, Y NO ES PEREZA: adivinar a qué proyecto se
// refiere cada frase sería inventarse datos de otra persona. Se queda donde
// está y en la interfaz pasa a llamarse «Notas de dependencias».
//
// POR QUÉ AQUÍ HAY GUARDA DE CICLOS Y EN `tasks.deps` NO
// `setTaskDeps` se limita a quitar la autorreferencia, así que A→B→A es posible
// hoy en tareas. No se repite ese error en proyectos por dos razones concretas:
// un ciclo deja sin sentido el camino crítico que el grafo promete calcular, y
// hace entrar en bucle al secuenciador de `project-sequence.ts`. Que lo viejo
// tenga el agujero no es motivo para abrirlo otra vez.

/**
 * Cuántos proyectos como mucho puede bloquear a uno.
 *
 * Veinte. No es un límite técnico: una lista sin tope deja de ser una
 * dependencia y pasa a ser un montón que nadie lee, y el selector de la
 * interfaz se vuelve inmanejable mucho antes de eso.
 */
export const MAX_DEPS = 20;

/**
 * Deja la lista en lo que se puede guardar: sin la autorreferencia, sin
 * duplicados, sin vacíos y con tope.
 *
 * Conserva el ORDEN de llegada a propósito: es el orden en que la persona
 * marcó las casillas, y reordenarlo haría que la lista se viera distinta al
 * recargar sin que nadie la hubiera tocado.
 */
export function limpiarDeps(projectId: string, ids: readonly string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const bruto of ids) {
    const id = typeof bruto === "string" ? bruto.trim() : "";
    // Un proyecto que depende de sí mismo se bloquea para siempre.
    if (id === "" || id === projectId || vistos.has(id)) continue;
    vistos.add(id);
    out.push(id);
    if (out.length === MAX_DEPS) break;
  }
  return out;
}

/**
 * Si poner `nuevas` como dependencias de `projectId` cerraría un círculo.
 *
 * Devuelve el camino del ciclo —para poder DECIRLO, no solo negarlo: «Mudanza →
 * Obra → Mudanza» se entiende y «no se puede» no— o `null` si no hay ninguno.
 *
 * Se juzga por la lista NUEVA y no por la que hubiera: reemplazar las
 * dependencias de un proyecto puede justamente ROMPER un ciclo que ya existía,
 * y negarse entonces sería impedir el arreglo.
 *
 * El recorrido lleva conjunto de visitados, así que un ciclo que ya estuviera
 * en los datos —heredado, o metido a mano en la base— hace que informe en vez
 * de colgarse. Colgar la pantalla sería peor que enseñar la forma rara.
 */
export function cicloAlAnadir(
  projectId: string,
  nuevas: readonly string[],
  actuales: ReadonlyMap<string, readonly string[]>
): string[] | null {
  const limpias = limpiarDeps(projectId, nuevas);

  // `de` mira las dependencias del proyecto que se está editando en la lista
  // NUEVA, y las del resto tal como están guardadas.
  const de = (id: string): readonly string[] =>
    id === projectId ? limpias : actuales.get(id) ?? [];

  for (const destino of limpias) {
    // ¿Se vuelve desde `destino` hasta `projectId`? Entonces la arista nueva
    // proyecto→destino cierra el círculo.
    const camino = caminoHasta(destino, projectId, de);
    if (camino !== null) return [projectId, ...camino];
  }
  return null;
}

/** Camino de `desde` a `hasta` siguiendo dependencias, o null. */
function caminoHasta(
  desde: string,
  hasta: string,
  de: (id: string) => readonly string[]
): string[] | null {
  const visitados = new Set<string>();
  const pila: { id: string; camino: string[] }[] = [{ id: desde, camino: [desde] }];

  while (pila.length > 0) {
    const actual = pila.pop()!;
    if (actual.id === hasta && actual.camino.length > 1) return actual.camino;
    if (visitados.has(actual.id)) continue;
    visitados.add(actual.id);

    for (const siguiente of de(actual.id)) {
      if (siguiente === hasta) return [...actual.camino, hasta];
      if (!visitados.has(siguiente)) {
        pila.push({ id: siguiente, camino: [...actual.camino, siguiente] });
      }
    }
  }
  return null;
}
