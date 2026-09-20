// src/lib/domain/centro/destacados.ts
// «Sigue por aquí» (D-168): la fila que hace que el menú del centro se sienta
// vivo. Puro, probado en tests/domain/centro-destacados.test.ts.
//
// SIN IA, Y ES DELIBERADO. Tres razones, en orden de importancia:
//   1. Llega con el primer HTML, no con la respuesta del modelo.
//   2. «Llevas 12 movimientos en Rediseño» es un hecho, no una opinión.
//   3. Funciona sin llave de IA y sin hechos suficientes, que es justo cuando
//      el centro más se nota vacío.
//
// La IA sigue mandando en «Lo siguiente», que es donde aporta: decidir QUÉ
// hacer. Aquí solo se decide A DÓNDE ir, y eso se deduce.

export const MAX_DESTACADOS = 5;

/** Con cuántos días de quincena restantes el dinero pasa a primer plano. */
const QUINCENA_CERCA = 3;

export interface SenalesDelDia {
  /** El proyecto donde más se ha movido algo últimamente, o `null`. */
  proyectoActivo: { id: string; title: string; movimientos: number } | null;
  vencidas: number;
  habitosPendientes: number;
  diasParaFinDeQuincena: number;
  presupuestoEnRojo: boolean;
}

export interface Destacado {
  href: string;
  label: string;
  motivo: string;
}

/**
 * De tres a cinco destinos, ordenados por lo que caduca antes.
 *
 * El orden no es estético: primero aquello en lo que la persona ya estaba
 * —retomar cuesta menos que empezar—, después lo que ya se pasó de fecha, y al
 * final lo que todavía tiene margen.
 *
 * `yaEnSugerencias` evita la sensación de tartamudeo: si la IA ya propuso ir a
 * Dinero ahí arriba, aquí no se repite.
 */
export function destacadosDelCentro(s: SenalesDelDia, yaEnSugerencias: string[]): Destacado[] {
  const fuera = new Set(yaEnSugerencias);
  const salida: Destacado[] = [];

  const añadir = (d: Destacado) => {
    if (salida.length >= MAX_DESTACADOS) return;
    if (fuera.has(d.href) || salida.some((x) => x.href === d.href)) return;
    salida.push(d);
  };

  if (s.proyectoActivo && s.proyectoActivo.movimientos > 0) {
    añadir({
      href: `/execution?project=${s.proyectoActivo.id}`,
      label: s.proyectoActivo.title,
      motivo: `${s.proyectoActivo.movimientos} movimientos estos días`
    });
  }

  if (s.vencidas > 0) {
    añadir({
      href: "/execution",
      label: "Proyectos y Tareas",
      motivo: `${s.vencidas} ${s.vencidas === 1 ? "tarea vencida" : "tareas vencidas"}`
    });
  }

  if (s.habitosPendientes > 0) {
    añadir({
      href: "/development/routines",
      label: "Rutinas y Hábitos",
      motivo: `${s.habitosPendientes} ${s.habitosPendientes === 1 ? "hábito pendiente" : "hábitos pendientes"} hoy`
    });
  }

  if (s.presupuestoEnRojo) {
    añadir({ href: "/money", label: "Dinero", motivo: "el presupuesto de la quincena está en rojo" });
  } else if (s.diasParaFinDeQuincena <= QUINCENA_CERCA) {
    const d = Math.max(0, s.diasParaFinDeQuincena);
    añadir({ href: "/money", label: "Dinero", motivo: d === 0 ? "la quincena cierra hoy" : `quedan ${d} días de quincena` });
  }

  return salida;
}
