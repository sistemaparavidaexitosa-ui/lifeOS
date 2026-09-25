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

export function hidratadoresDeHoy(f: FuentesDeHoy, grafo: LectorDelGrafo): Hidratadores {
  return {
    hero: async () => ({
      saludo: f.saludo,
      nombre: f.nombre,
      fechaISO: f.fechaISO,
      frase: f.unicaCosa ? recortar(`Lo que importa hoy: ${f.unicaCosa}`, LIMITES.heroFrase) : null
    }),

    narrative: async () => {
      const texto = f.resumen.trim();
      return texto ? { titulo: "Tu narrativa de hoy", texto, href: null } : null;
    },

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
