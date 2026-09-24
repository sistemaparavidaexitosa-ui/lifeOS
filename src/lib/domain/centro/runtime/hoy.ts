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
import type { AccionRapida, ItemDeTarea } from "./secciones.ts";

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
      detalle: s.vencidas > 0 ? plural(s.vencidas, "vencida", "vencidas") : `${f.tareas.length} en el plan`,
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
      frase: f.unicaCosa ? `Lo que importa hoy: ${f.unicaCosa}` : null
    }),

    narrative: async () => {
      const texto = f.resumen.trim();
      return texto ? { titulo: "Tu narrativa de hoy", texto, href: null } : null;
    },

    tasks: async () => {
      const tareas = f.tareas.slice(0, f.unicaCosa ? MAX_FOCO - 1 : MAX_FOCO);
      const proyectos = await Promise.all(tareas.map((t) => grafo.proyectoDeTarea(t.id).catch(() => null)));

      const items: ItemDeTarea[] = [];
      if (f.unicaCosa) items.push({ id: "una-cosa", titulo: f.unicaCosa, contexto: "Una cosa", href: null });
      tareas.forEach((t, i) => {
        const p = proyectos[i];
        items.push({
          id: t.id,
          titulo: t.title,
          contexto: p ? `Proyecto · ${p.titulo}` : null,
          href: p ? `/execution?project=${p.id}` : "/execution"
        });
      });
      return items.length > 0 ? { fechaISO: f.fechaISO, items } : null;
    },

    quickActions: async () => ({ items: accionesRapidas(f) })
  };
}
