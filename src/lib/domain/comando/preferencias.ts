// src/lib/domain/comando/preferencias.ts
// Qué aprende el sistema de por dónde navegas (D-183) — puro, probado en
// tests/domain/comando-preferencias.test.ts.
//
// QUÉ SE APRENDE: EL RITMO, Y EL VOLUMEN ORDENA
// Decisión del dueño del sistema (2026-09-20): cuenta tanto CUÁNDO abres algo
// como CUÁNTO. Pero las dos cosas no hacen el mismo trabajo:
//
//   - El RITMO decide si hay preferencia. «Esto lo abres por las mañanas» solo
//     es cierto si lo abres por las mañanas MÁS de lo que abres cualquier otra
//     cosa por las mañanas. Sin eso no hay ritmo, hay una ruta popular.
//   - El VOLUMEN decide el ORDEN entre las que ya pasaron ese filtro.
//
// POR QUÉ EL CONTRAFACTUAL DE D-174 NO SE COPIA TAL CUAL
// `aprendizaje.ts` exige días SIN el rasgo para poder medir: sin contraste, un
// lift no significa nada. Aquí ese guardarraíl se volvería absurdo — si abres
// la watchlist todas las mañanas sin faltar una, es exactamente cuando más
// seguro estás de quererla, y callarse sería el caso más tonto posible.
//
// Lo que sí se conserva es que la preferencia NO SEA PERMANENTE: la ventana es
// móvil. Deja de abrir algo y en `ventanaDias` desaparece de sus preferencias
// sin que nadie tenga que acordarse de quitarla. Esa es la propiedad que
// importaba, y aquí la da la ventana en vez del contrafactual.
//
// El confundido real, y contra el que sí hay guarda, es otro: una ruta que
// abres mucho pero repartida por todo el día no tiene ritmo, y anunciarla como
// «lo tuyo de las mañanas» sería inventarse un patrón.

import type { Franja } from "../centro/franja.ts";

/** Una visita, ya reducida a lo que hace falta. */
export interface Visita {
  ruta: string;
  franja: Franja;
  /** El día LOCAL, YYYY-MM-DD. */
  dia: string;
}

export interface UmbralesNavegacion {
  /** Días distintos con visitas. Con menos, no se afirma nada. */
  minDias: number;
  /** Visitas a esa ruta en esa franja. */
  minN: number;
  /**
   * Cuántos puntos porcentuales por encima del reparto normal de esa franja
   * tiene que estar la ruta para que se considere ritmo y no casualidad.
   */
  minLift: number;
  /** Cuántos días atrás se mira. La ventana ES el olvido. */
  ventanaDias: number;
  maxPreferencias: number;
}

/**
 * Los mismos números que `UMBRALES_DECISION` y que `UMBRALES` de
 * `domain/identity/estilo.ts`, donde se puede.
 *
 * No es pereza: son los que llevan meses sin producir una preferencia falsa, y
 * tres calibraciones distintas para el mismo tipo de inferencia serían tres
 * cosas que ajustar y dos que nadie recordaría por qué difieren.
 */
export const UMBRALES_NAVEGACION: UmbralesNavegacion = {
  minDias: 14,
  minN: 7,
  minLift: 6,
  ventanaDias: 30,
  maxPreferencias: 3
};

export type Confianza = "baja" | "media" | "alta";

export interface PreferenciaDeNavegacion {
  ruta: string;
  franja: Franja;
  /** Visitas a esa ruta en esa franja, dentro de la ventana. El volumen. */
  n: number;
  /** Días distintos en que ocurrió. */
  dias: number;
  /** Puntos por encima del reparto normal de la franja. El ritmo. */
  lift: number;
  confianza: Confianza;
}

export interface LibroDeNavegacion {
  preferencias: PreferenciaDeNavegacion[];
  /** Días distintos medidos. Se expone para poder decir «todavía no sé». */
  dias: number;
  /** Por qué no hay preferencias, cuando no las hay. Texto pintable. */
  motivo?: string;
}

function confianzaDe(n: number, lift: number): Confianza {
  if (n >= 20 && lift >= 15) return "alta";
  if (n >= 12 && lift >= 10) return "media";
  return "baja";
}

/** Los días de la ventana, contando hacia atrás desde hoy. */
function dentroDeLaVentana(visitas: readonly Visita[], hoy: string, dias: number): Visita[] {
  const corte = new Date(`${hoy}T00:00:00Z`);
  corte.setUTCDate(corte.getUTCDate() - dias);
  const desde = corte.toISOString().slice(0, 10);
  return visitas.filter((v) => v.dia > desde);
}

/**
 * Qué rutas son «lo tuyo» de cada franja.
 *
 * `desdeLaRevision` es la fecha de la última entrada de `identity_revisions`:
 * lo anterior se descarta entero, igual que en `aprendizaje.ts`. Quien cambió
 * en quién quiere convertirse no merece que le sigan empujando la rutina del
 * que era.
 */
export function libroDeNavegacion(
  visitas: readonly Visita[],
  opciones: { hoy: string; desdeLaRevision?: string | null; umbrales?: Partial<UmbralesNavegacion> } = {
    hoy: "1970-01-01"
  }
): LibroDeNavegacion {
  const u = { ...UMBRALES_NAVEGACION, ...opciones.umbrales };
  const corte = opciones.desdeLaRevision ?? null;

  let vigentes = dentroDeLaVentana(visitas, opciones.hoy, u.ventanaDias);
  if (corte) vigentes = vigentes.filter((v) => v.dia >= corte);

  const dias = new Set(vigentes.map((v) => v.dia)).size;
  if (dias < u.minDias) {
    return {
      preferencias: [],
      dias,
      motivo: `Todavía no hay suficientes días de uso (${dias} de ${u.minDias}) para afirmar nada.`
    };
  }

  const total = vigentes.length;
  const preferencias: PreferenciaDeNavegacion[] = [];

  const franjas = [...new Set(vigentes.map((v) => v.franja))];
  for (const franja of franjas) {
    const enLaFranja = vigentes.filter((v) => v.franja === franja);
    // Qué proporción de TODA tu navegación cae en esta franja. Es la línea base
    // contra la que se mide si una ruta es «de aquí» o simplemente frecuente.
    const baseFranja = (enLaFranja.length / total) * 100;

    for (const ruta of new Set(enLaFranja.map((v) => v.ruta))) {
      const deLaRuta = vigentes.filter((v) => v.ruta === ruta);
      const aqui = deLaRuta.filter((v) => v.franja === franja);

      if (aqui.length < u.minN) continue;

      // EL RITMO: qué parte de las visitas a ESTA ruta caen en ESTA franja,
      // comparado con lo que cabría esperar por el reparto general del día.
      // Una ruta que abres a todas horas da lift ~0 y no produce preferencia,
      // por muchas visitas que acumule.
      const lift = (aqui.length / deLaRuta.length) * 100 - baseFranja;
      if (lift < u.minLift) continue;

      preferencias.push({
        ruta,
        franja,
        n: aqui.length,
        dias: new Set(aqui.map((v) => v.dia)).size,
        lift: Math.round(lift),
        confianza: confianzaDe(aqui.length, lift)
      });
    }
  }

  // EL VOLUMEN ORDENA, una vez pasado el filtro del ritmo. A igualdad, manda el
  // ritmo más marcado: entre dos cosas que haces igual de a menudo, arriba la
  // que es más claramente de esta hora.
  preferencias.sort((a, b) => b.n - a.n || b.lift - a.lift);

  return { preferencias: preferencias.slice(0, u.maxPreferencias), dias };
}

/** Lo que toca ahora mismo, si es que toca algo. */
export function preferenciaDeAhora(libro: LibroDeNavegacion, franja: Franja): PreferenciaDeNavegacion | null {
  return libro.preferencias.find((p) => p.franja === franja) ?? null;
}
