// src/lib/domain/centro/runtime/generador.ts
// Quién decide QUÉ se enseña (D-188). Puro, probado en
// tests/domain/centro-runtime-generador.test.ts.
//
// LA INTERFAZ ES LO QUE SE QUEDA. `ScreenGenerator` es asíncrona aunque la
// única implementación no espere a nada, porque la siguiente —un modelo— sí
// esperará, y cambiar la firma entonces obligaría a tocar a quien llama.
//
// POR QUÉ DETERMINISTA. Mismo intento, mismo plan: se puede probar, no cuesta
// una llamada y no se equivoca de formas nuevas. Planifica los seis intentos
// aunque solo «hoy» tenga hidratadores; los demás se pintan con `emptyState`
// hasta que los tengan, y así el contrato completo se ejercita desde ya.

import type { Franja } from "../franja.ts";
import type { FlagsDelRuntime } from "./flags.ts";
import type { HuecoDelPlan, ScreenPlan } from "./plan.ts";
import type { Action, Intent, IntentKind } from "./types.ts";

export interface EntradaDelGenerador {
  intent: Intent;
  franja: Franja;
  flags: FlagsDelRuntime;
}

export interface ScreenGenerator {
  readonly id: string;
  generar(e: EntradaDelGenerador): Promise<ScreenPlan>;
}

const HUECOS: Record<IntentKind, HuecoDelPlan[]> = {
  hoy: [
    { id: "hero", kind: "hero" },
    { id: "narrativa", kind: "narrative" },
    { id: "foco", kind: "tasks", title: "Tu foco de hoy" },
    { id: "sigue", kind: "quickActions", title: "Sigue por aquí" }
  ],
  portafolio: [
    { id: "comentario", kind: "narrative" },
    { id: "portafolio", kind: "portfolio", title: "Tu portafolio hoy" },
    { id: "watchlist", kind: "watchlist", title: "Tu watchlist" },
    { id: "noticias", kind: "cards", title: "Noticias del mercado" }
  ],
  proyecto: [
    { id: "linea", kind: "timeline", title: "Línea de tiempo" },
    { id: "kpis", kind: "metric", title: "KPIs" },
    { id: "riesgos", kind: "cards", title: "Riesgos" },
    { id: "documentos", kind: "table", title: "Documentos" },
    { id: "personas", kind: "cards", title: "Personas" },
    { id: "actividad", kind: "journal", title: "Actividad reciente" }
  ],
  semana: [
    { id: "calendario", kind: "calendar", title: "Tu semana" },
    { id: "proyectos", kind: "projects", title: "Proyectos" },
    { id: "una-cosa", kind: "tasks", title: "Una cosa" },
    { id: "tiempo", kind: "metric", title: "Tiempo disponible" }
  ],
  dinero: [
    { id: "patrimonio", kind: "metric", title: "Patrimonio" },
    { id: "presupuesto", kind: "money", title: "Presupuesto y flujo" },
    { id: "flujo", kind: "chart", title: "Flujo de caja" },
    { id: "pagos", kind: "table", title: "Próximos pagos" }
  ],
  libre: [{ id: "respuesta", kind: "text" }]
};

const TITULOS: Record<IntentKind, string> = {
  hoy: "Centro",
  portafolio: "Mercado de hoy",
  proyecto: "Proyecto",
  semana: "Tu semana",
  dinero: "Tu dinero",
  libre: "Centro"
};

const VOLVER: Action[] = [{ label: "Volver a hoy", intent: "hoy" }];

/** El nombre del proyecto acaba en un id: corto, sin mayúsculas. */
const MAX_REF_EN_ID = 60;

export const generadorDeterminista: ScreenGenerator = {
  id: "determinista",
  async generar({ intent }) {
    const k = intent.kind;
    const ref = intent.ref?.trim();
    return {
      id: ref ? `${k}:${ref.toLowerCase().slice(0, MAX_REF_EN_ID)}` : k,
      intent: { ...intent },
      title: k === "proyecto" && ref ? ref : TITULOS[k],
      // Copias: quien reciba el plan puede tocarlo sin cambiar el siguiente.
      huecos: HUECOS[k].map((h) => ({ ...h })),
      actions: k === "hoy" ? [] : VOLVER.map((a) => ({ ...a })),
      refreshPolicy: k === "hoy" ? { tipo: "porFranja" } : { tipo: "alAbrir" }
    };
  }
};
