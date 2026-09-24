// src/lib/domain/centro/runtime/types.ts
// El modelo de pantalla del runtime del Centro (D-188). Puro.
//
// UNA PANTALLA ES DATOS. No hay un solo campo que se pueda ejecutar: las
// secciones son `kind` + datos, las acciones son un enlace interno o un intento.
// Eso es lo que permite que mañana la escriba un modelo: lo peor que puede
// devolver es una pantalla fea, y el validador la para antes.

import type { DatosDe, SectionKind } from "./secciones.ts";

export const INTENT_KINDS = ["hoy", "portafolio", "proyecto", "semana", "dinero", "libre"] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

export interface Intent {
  kind: IntentKind;
  /** Lo que se nombró: «Malpaso» en «abre Malpaso». Solo en `proyecto`. */
  ref?: string;
  /** El texto tal cual, cuando no se entendió. Solo en `libre`. */
  texto?: string;
}

/** Un enlace dentro de la aplicación, o pedir otra pantalla. Nunca las dos cosas. */
export type Action = { label: string; href: string } | { label: string; intent: IntentKind };

export type RefreshPolicy = { tipo: "alAbrir" } | { tipo: "cada"; segundos: number } | { tipo: "porFranja" };

export interface Section<K extends SectionKind = SectionKind> {
  id: string;
  kind: K;
  title?: string;
  data: DatosDe<K>;
}

/** La unión que conserva la pareja kind↔datos: con `Section<SectionKind>` se perdería. */
export type AnySection = { [K in SectionKind]: Section<K> }[SectionKind];

export interface Screen {
  id: string;
  /** De qué intento salió. Lo necesita el aprendizaje, no el renderer. */
  intent: IntentKind;
  title: string;
  subtitle?: string;
  narrative?: string;
  layout: { densidad: "aireada" | "compacta" };
  sections: AnySection[];
  actions: Action[];
  refreshPolicy: RefreshPolicy;
  /**
   * `escritura: false` como TIPO, no como valor. En Fase 1 ninguna pantalla
   * escribe; permitirlo exigirá cambiar esta línea, no colar un `true` en JSON.
   */
  permissions: { lectura: true; escritura: false };
}
