// src/lib/domain/centro/agente/turno.ts
// La última puerta del turno (D-194). Pura.
import { validarScreen } from "../runtime/validador.ts";
import type { AnySection, Screen } from "../runtime/types.ts";
import { tieneCifras } from "./texto.ts";

export interface EntradaComponer {
  texto: string;
  secciones: AnySection[];
  proyectos: { id: string }[];
}

export function componerTurno(e: EntradaComponer): { texto: string; secciones: AnySection[] } {
  const limpias = e.secciones.filter((s) => !(s.kind === "insight" && tieneCifras(s.data.texto)));
  if (limpias.length === 0) return { texto: e.texto, secciones: [] };
  const screen: Screen = {
    id: "turno",
    intent: "libre",
    title: "Centro",
    layout: { densidad: "aireada" },
    sections: limpias,
    actions: [],
    refreshPolicy: { tipo: "alAbrir" },
    permissions: { lectura: true, escritura: false }
  };
  const r = validarScreen(screen, { proyectos: e.proyectos });
  return r.ok ? { texto: e.texto, secciones: r.screen.sections } : { texto: e.texto, secciones: [] };
}

/**
 * Las secciones de una capacidad llevan un id fijo (`mercado-watchlist`…):
 * basta para UNA sola vez por turno, pero si el modelo pide la misma
 * capacidad dos veces —dos «mercado» con vistas distintas, por ejemplo— los
 * ids chocan y `validarScreen` tira la pantalla ENTERA por sección repetida.
 * Anteponer el id del bloque (`b0-mercado-watchlist`, `b1-mercado-watchlist`)
 * los vuelve a hacer únicos sin que la capacidad tenga que saber en qué
 * bloque vive.
 */
export function prefijarSecciones(secciones: AnySection[], prefijo: string): AnySection[] {
  return secciones.map((s) => ({ ...s, id: `${prefijo}-${s.id}` }) as AnySection);
}
