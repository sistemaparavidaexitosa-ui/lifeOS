// src/lib/domain/centro/agente/turno.ts
// La última puerta del turno (D-194). Pura.
import { MAX_SECCIONES, validarScreen } from "../runtime/validador.ts";
import type { AnySection, Screen } from "../runtime/types.ts";
import { tieneCifras } from "./texto.ts";

export interface EntradaComponer {
  texto: string;
  secciones: AnySection[];
  proyectos: { id: string }[];
}

/** Una pantalla de UNA sección, para pasarla sola por `validarScreen`. */
function pantallaDe(sections: AnySection[]): Screen {
  return {
    id: "turno",
    intent: "libre",
    title: "Centro",
    layout: { densidad: "aireada" },
    sections,
    actions: [],
    refreshPolicy: { tipo: "alAbrir" },
    permissions: { lectura: true, escritura: false }
  };
}

/**
 * SECCIÓN POR SECCIÓN (spec: «bloque con forma inválida → ese bloque no
 * sale»). Cada sección pasa sola por el validador del runtime; la que no pasa
 * se cae con su motivo en el log y las demás siguen. Validar la pantalla
 * entera de una vez —como hace el lienzo de Fase 1, que tiene respaldo— tiraba
 * TODO el turno por un solo enlace malo (lo encontró la revisión final: «¿Qué
 * hago hoy?» se quedaba en texto cuando una tarea tenía proyecto).
 */
export function componerTurno(e: EntradaComponer): { texto: string; secciones: AnySection[] } {
  const buenas: AnySection[] = [];
  const ids = new Set<string>();
  for (const s of e.secciones) {
    if (s.kind === "insight" && tieneCifras(s.data.texto)) {
      console.warn(`[centro-agente] sección «${s.id}» (${s.kind}) descartada: el insight lleva cifras.`);
      continue;
    }
    if (ids.has(s.id)) {
      console.warn(`[centro-agente] sección «${s.id}» (${s.kind}) descartada: id repetido.`);
      continue;
    }
    if (buenas.length >= MAX_SECCIONES) {
      console.warn(`[centro-agente] sección «${s.id}» (${s.kind}) descartada: más de ${MAX_SECCIONES} secciones.`);
      continue;
    }
    const r = validarScreen(pantallaDe([s]), { proyectos: e.proyectos });
    if (!r.ok) {
      console.warn(`[centro-agente] sección «${s.id}» (${s.kind}) descartada: ${r.reason}`);
      continue;
    }
    ids.add(s.id);
    buenas.push(r.screen.sections[0]!);
  }
  return { texto: e.texto, secciones: buenas };
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
