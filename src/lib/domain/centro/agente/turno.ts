// src/lib/domain/centro/agente/turno.ts
// La última puerta del turno (D-194). Pura.
import { validarPorSeccion } from "../runtime/validador.ts";
import type { AnySection } from "../runtime/types.ts";
import { tieneCifras } from "./texto.ts";

export interface EntradaComponer {
  texto: string;
  secciones: AnySection[];
  proyectos: { id: string }[];
}

/**
 * SECCIÓN POR SECCIÓN (spec: «bloque con forma inválida → ese bloque no
 * sale»). El chequeo propio del insight con cifras corre primero, ANTES de
 * `validarPorSeccion` (T1): esa regla es del agente, no del runtime, y no
 * depende de las demás secciones ni del orden en que se validen. El resto —id
 * repetido, MAX_SECCIONES, forma y contenido— lo hace `validarPorSeccion`
 * (compartida con `armarPantallaConProyectos`, que hasta T1 validaba la
 * pantalla entera y tiraba TODO el turno por un solo enlace malo).
 */
export function componerTurno(e: EntradaComponer): { texto: string; secciones: AnySection[] } {
  const sinInsightsConCifras = e.secciones.filter((s) => {
    if (s.kind === "insight" && tieneCifras(s.data.texto)) {
      console.warn(`[centro-agente] sección «${s.id}» (${s.kind}) descartada: el insight lleva cifras.`);
      return false;
    }
    return true;
  });
  return { texto: e.texto, secciones: validarPorSeccion(sinInsightsConCifras, e.proyectos, "centro-agente") };
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
