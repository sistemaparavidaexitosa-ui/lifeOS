// src/lib/domain/centro/runtime/hoy.ts
// De qué se llena la pantalla «Hoy» (D-189, D-190). Puro, probado en
// tests/domain/centro-runtime-hoy.test.ts.
//
// EL GRAFO PRIMERO, Y SOLO PARA LO QUE SABE. El grafo es una proyección de
// ESTRUCTURA: sabe que «Revisar avances U3» pertenece a Malpaso, no sabe si hoy
// marcaste un hábito. Así que de él sale la relación —el «Proyecto · Malpaso»
// de cada fila— y los valores salen de `FuentesDeHoy`, que el servidor llena con
// lo que `/api/centro` YA había cargado. Cada salida del grafo está nombrada
// aquí, que es lo que el encargo pedía: que no haya consultas escondidas.
//
// EL GRAFO ES UN PUERTO. `LectorDelGrafo` es una interfaz; la implementación
// (src/lib/centro/runtime/grafo.ts) es la única que conoce Supabase. Si el
// grafo falla, la fila sale sin proyecto: es un adorno, no el contenido.

import type { Hidratadores } from "./ensamblar.ts";
import { LIMITES, recortar, type AccionRapida, type DatosRutina, type ItemDeTarea } from "./secciones.ts";

export interface LectorDelGrafo {
  /** El proyecto al que pertenece una tarea, o `null` si el grafo no lo sabe. */
  proyectoDeTarea(taskId: string): Promise<{ id: string; titulo: string } | null>;
}

export interface FuentesDeHoy {
  saludo: string;
  nombre: string;
  fechaISO: string;
  /** El «cómo voy» de la franja. Vacío = no hay narrativa. */
  resumen: string;
  unicaCosa: string | null;
  tareas: { id: string; title: string }[];
  senales: { vencidas: number; diasParaFinDeQuincena: number; presupuestoEnRojo: boolean };
  habitosPendientes: number;
  /**
   * La rutina de ahora mismo (T3), de `construirSecuencia` filtrada a
   * `routineStep`. `null` = no hay rutina que toque, o ya no le queda ningún
   * hábito pendiente — las dos son «no hay nada que enseñar aquí».
   */
  rutina: { routineId: string; nombre: string; habitos: { habitId: string; nombre: string; durationMin: number }[] } | null;
}

/** Cinco, contando la una cosa. Más ya no es un foco. */
export const MAX_FOCO = 5;

/** Con cuántos días de quincena restantes el atajo de dinero lo dice (mismo umbral que `lienzo.ts`). */
const QUINCENA_CERCA = 3;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function accionesRapidas(f: FuentesDeHoy): AccionRapida[] {
  const s = f.senales;
  return [
    {
      etiqueta: "Proyectos",
      // Sin cifra cuando no hay vencidas: `tareas` son las de más impacto, no el
      // plan del día, y «0 en el plan» decía algo falso.
      detalle: s.vencidas > 0 ? plural(s.vencidas, "vencida", "vencidas") : "Sin vencidas",
      href: "/execution",
      icono: "proyectos"
    },
    {
      etiqueta: "Rutinas",
      detalle: f.habitosPendientes > 0 ? plural(f.habitosPendientes, "pendiente", "pendientes") : "Al día",
      href: "/development/routines",
      icono: "rutinas"
    },
    { etiqueta: "Biblioteca", detalle: "Lectura", href: "/development/library", icono: "biblioteca" },
    {
      etiqueta: "Finanzas",
      detalle: s.presupuestoEnRojo
        ? "Presupuesto en rojo"
        : s.diasParaFinDeQuincena <= QUINCENA_CERCA
          ? `Quincena en ${plural(s.diasParaFinDeQuincena, "día", "días")}`
          : "Patrimonio",
      href: "/money",
      icono: "finanzas"
    }
  ];
}

/**
 * «Tu narrativa de hoy» SIN MODELO (rediseño): el foco, lo que arrastras, la
 * rutina y el dinero, en ese orden y con tres frases como mucho. Antes la
 * escribía la IA en cada franja; con las mismas señales que ya cargaba la
 * pantalla, unas reglas dicen lo mismo y no gastan un token.
 */
export function narrativaDeHoy(f: FuentesDeHoy): string {
  const frases: string[] = [];
  const s = f.senales;
  if (f.unicaCosa) frases.push(`Hoy lo que importa es «${recortar(f.unicaCosa, 80)}».`);
  else if (f.tareas.length) frases.push(`Tienes ${plural(f.tareas.length, "tarea", "tareas")} de alto impacto en el radar.`);
  else frases.push("Día despejado: elige la una cosa que haría que hoy valga la pena.");

  if (s.vencidas > 0) frases.push(`Arrastras ${plural(s.vencidas, "vencida", "vencidas")}: despéjalas antes de sumar nuevas.`);
  else frases.push(f.habitosPendientes > 0 ? `Te quedan ${plural(f.habitosPendientes, "hábito", "hábitos")} de tu rutina.` : "Tu rutina está al día.");

  if (s.presupuestoEnRojo) frases.push("Tu presupuesto va en rojo: cuida el gasto de hoy.");
  else if (s.diasParaFinDeQuincena <= QUINCENA_CERCA) frases.push(`La quincena cierra en ${plural(s.diasParaFinDeQuincena, "día", "días")}.`);

  return frases.slice(0, 3).join(" ");
}

export function hidratadoresDeHoy(f: FuentesDeHoy, grafo: LectorDelGrafo): Hidratadores {
  return {
    hero: async () => ({
      saludo: f.saludo,
      nombre: f.nombre,
      fechaISO: f.fechaISO,
      frase: f.unicaCosa ? recortar(`Lo que importa hoy: ${f.unicaCosa}`, LIMITES.heroFrase) : null
    }),

    narrative: async () => ({ titulo: "Tu narrativa de hoy", texto: narrativaDeHoy(f), href: null }),

    tasks: async () => {
      const tareas = f.tareas.slice(0, f.unicaCosa ? MAX_FOCO - 1 : MAX_FOCO);
      const proyectos = await Promise.all(tareas.map((t) => grafo.proyectoDeTarea(t.id).catch(() => null)));

      const items: ItemDeTarea[] = [];
      // Lo que escribió la persona se RECORTA al tope del validador: un título
      // largo no puede tumbar la pantalla entera.
      if (f.unicaCosa) {
        items.push({ id: "una-cosa", titulo: recortar(f.unicaCosa, LIMITES.tareaTitulo), contexto: "Una cosa", href: null });
      }
      tareas.forEach((t, i) => {
        const p = proyectos[i];
        items.push({
          id: t.id,
          titulo: recortar(t.title, LIMITES.tareaTitulo),
          contexto: p ? recortar(`Proyecto · ${p.titulo}`, LIMITES.tareaContexto) : null,
          href: p ? `/execution?project=${p.id}` : "/execution"
        });
      });
      return items.length > 0 ? { fechaISO: f.fechaISO, items } : null;
    },

    quickActions: async () => ({ items: accionesRapidas(f) }),

    // T3: sin rutina o sin hábitos pendientes, nada que mostrar — la sección
    // no sale (ver el contrato de `Hidratadores`: `null` es «no hay nada que
    // decir», distinto de `emptyState` o `error`).
    rutina: async (): Promise<DatosRutina | null> => {
      const r = f.rutina;
      if (!r || r.habitos.length === 0) return null;
      return {
        routineId: r.routineId,
        nombre: r.nombre,
        habitos: r.habitos.map((h) => ({ habitId: h.habitId, nombre: h.nombre, duracionMin: h.durationMin }))
      };
    }
  };
}
