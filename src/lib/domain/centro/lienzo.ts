// src/lib/domain/centro/lienzo.ts
// El centro dice QUÉ HACER, una cosa a la vez (D-169). Puro, probado en
// tests/domain/centro-lienzo.test.ts.
//
// POR QUÉ ESTO SUSTITUYE AL MENÚ. El centro enseñaba 23 destinos, una rejilla
// de cifras y unas líneas de lo que la IA deducía; aunque acertara, se leía
// como un panel con un widget encima. Aquí se invierte la proporción: lo
// derivado ES la pantalla. Para navegar está la barra lateral, que nunca se
// tocó.
//
// NO ES UNA SECUENCIA. El ritual de la mañana (D-165) sí lo es y sigue
// siéndolo. Esto es una pila de cosas que atender: no hay paso 3 de 7, hay «lo
// siguiente».

/** Seis. Más que eso deja de ser «qué hago ahora» y vuelve a ser una bandeja. */
export const MAX_TARJETAS = 6;

/** Con cuántos días de quincena restantes el dinero merece una tarjeta. */
const QUINCENA_CERCA = 3;

export interface HabitoDelLienzo {
  routineId: string;
  routineName: string;
  habitId: string;
  nombre: string;
  durationMin: number;
}

export interface PropuestaDelLienzo {
  id: string;
  tipo: string;
  titulo: string;
  motivo: string;
  href: string | null;
}

export interface EntradaLienzo {
  /** El «cómo voy» de esta franja. Vacío = no hay apertura. */
  resumen: string;
  proximoHabito: HabitoDelLienzo | null;
  propuestas: PropuestaDelLienzo[];
  unicaCosa: string | null;
  vencidas: number;
  diasParaFinDeQuincena: number;
  presupuestoEnRojo: boolean;
}

export type Tarjeta =
  | { id: string; kind: "apertura"; voz: string; titulo: string }
  | { id: string; kind: "habito"; voz: string; titulo: string; routineId: string; habitId: string }
  | { id: string; kind: "propuesta"; voz: string; titulo: string; propuestaId: string; accion: string; href: string | null }
  | { id: string; kind: "unicaCosa"; voz: string; titulo: string }
  | { id: string; kind: "dinero"; voz: string; titulo: string; href: string }
  | { id: string; kind: "vencidas"; voz: string; titulo: string; href: string }
  | { id: string; kind: "cierre"; voz: string; titulo: string };

const CIERRE: Tarjeta = {
  id: "cierre",
  kind: "cierre",
  voz: "",
  titulo: "Ya está. ¿Algo más?"
};

/**
 * Las tarjetas del día, ordenadas por lo que caduca antes.
 *
 * El orden no es estético. Primero lo que solo sirve AHORA —un hábito anclado a
 * un bloque horario deja de tener sentido cuando pasa—, después lo que la IA
 * propuso con los datos de esta franja, y al final lo que sigue ahí lo mires
 * cuando lo mires.
 *
 * `pospuestas` son las que la persona apartó con «Ahora no»: bajan al final en
 * vez de desaparecer. Apartar no es descartar; descartar es otro botón y otra
 * tabla.
 */
export function tarjetasDelCentro(e: EntradaLienzo, pospuestas: string[]): Tarjeta[] {
  const tarjetas: Tarjeta[] = [];

  if (e.resumen.trim()) {
    tarjetas.push({ id: "apertura", kind: "apertura", voz: "", titulo: e.resumen.trim() });
  }

  if (e.proximoHabito) {
    const h = e.proximoHabito;
    tarjetas.push({
      id: `${h.routineId}:${h.habitId}`,
      kind: "habito",
      voz: `${h.routineName} · ${h.durationMin} min`,
      titulo: h.nombre,
      routineId: h.routineId,
      habitId: h.habitId
    });
  }

  for (const p of e.propuestas) {
    tarjetas.push({
      id: `propuesta:${p.id}`,
      kind: "propuesta",
      voz: p.motivo,
      titulo: p.titulo,
      propuestaId: p.id,
      // `foco` no crea nada: lleva a una pantalla. El resto sí crean.
      accion: p.tipo === "foco" ? "Ir" : "Añadir",
      href: p.href
    });
  }

  if (e.unicaCosa) {
    tarjetas.push({
      id: "unica",
      kind: "unicaCosa",
      voz: "Tu Única Cosa de hoy",
      titulo: e.unicaCosa
    });
  }

  if (e.presupuestoEnRojo) {
    tarjetas.push({ id: "dinero", kind: "dinero", voz: "el presupuesto de la quincena está en rojo", titulo: "Revisa tu dinero", href: "/money" });
  } else if (e.diasParaFinDeQuincena <= QUINCENA_CERCA) {
    const d = Math.max(0, e.diasParaFinDeQuincena);
    tarjetas.push({
      id: "dinero",
      kind: "dinero",
      voz: d === 0 ? "la quincena cierra hoy" : `quedan ${d} días de quincena`,
      titulo: "Revisa tu dinero",
      href: "/money"
    });
  }

  if (e.vencidas > 0) {
    tarjetas.push({
      id: "vencidas",
      kind: "vencidas",
      voz: `${e.vencidas} ${e.vencidas === 1 ? "tarea vencida" : "tareas vencidas"}`,
      titulo: "Ponte al día con lo vencido",
      href: "/execution"
    });
  }

  // Lo apartado baja al final, sin duplicarse.
  const apartadas = new Set(pospuestas);
  const ordenadas = [...tarjetas.filter((t) => !apartadas.has(t.id)), ...tarjetas.filter((t) => apartadas.has(t.id))];

  return [...ordenadas.slice(0, MAX_TARJETAS), CIERRE];
}
