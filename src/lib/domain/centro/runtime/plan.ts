// src/lib/domain/centro/runtime/plan.ts
// Lo que decide el agente: QUÉ se enseña (D-188). Puro.
//
// UN PLAN NO TIENE DATOS, Y NO PUEDE TENERLOS. No hay campo donde ponerlos. Es
// la mitad del reparto de responsabilidades: el generador elige secciones y
// orden; los hidratadores, qué datos llevan. Un generador —hoy determinista,
// mañana un modelo— que quisiera inventarse una cifra no tiene dónde escribirla.

import type { SectionKind } from "./secciones.ts";
import type { Action, Intent, RefreshPolicy } from "./types.ts";

export interface HuecoDelPlan {
  id: string;
  kind: SectionKind;
  title?: string;
}

export interface ScreenPlan {
  id: string;
  intent: Intent;
  title: string;
  subtitle?: string;
  huecos: HuecoDelPlan[];
  actions: Action[];
  refreshPolicy: RefreshPolicy;
}
