// src/lib/domain/centro/runtime/ensamblar.ts
// Del plan (QUÉ) a la pantalla (con datos) (D-189). Puro salvo el reloj,
// probado en tests/domain/centro-runtime-ensamblar.test.ts.
//
// UNA SECCIÓN NO TUMBA LA PANTALLA. Cada hidratador corre en paralelo, con su
// propio límite de tiempo, y su fallo se queda en su sección:
//
//   · sin hidratador    → `emptyState` (existe en el plan, no sabe llenarse);
//   · lanza o se pasa   → `error` (sabía llenarse y esta vez no pudo);
//   · devuelve `null`   → la sección no sale (no hay nada que decir, y una
//                         sección vacía no es información).
//
// Son tres estados distintos a propósito: vacío y roto no son lo mismo (ver
// `Subgraph.reason` en domain/graph/types.ts), y quien mire la pantalla tiene
// que poder distinguirlos.

import type { HuecoDelPlan, ScreenPlan } from "./plan.ts";
import type { DatosDe, SectionKind } from "./secciones.ts";
import type { AnySection, Screen } from "./types.ts";

/** Lo que tarda de más una sección antes de darla por perdida. */
export const TIEMPO_POR_SECCION_MS = 1500;

export const MENSAJE_SIN_HIDRATADOR = "Esta parte todavía no sabe llenarse.";
export const MENSAJE_FALLO = "No se pudo cargar esta parte.";

export type Hidratadores = {
  [K in SectionKind]?: (hueco: HuecoDelPlan) => Promise<DatosDe<K> | null>;
};

export function conLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error("tiempo agotado")), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(reloj));
}

async function hidratar(hueco: HuecoDelPlan, hidratadores: Hidratadores, ms: number): Promise<AnySection | null> {
  const base = { id: hueco.id, ...(hueco.title ? { title: hueco.title } : {}) };
  const h = hidratadores[hueco.kind] as ((x: HuecoDelPlan) => Promise<unknown>) | undefined;
  if (!h) return { ...base, kind: "emptyState", data: { mensaje: MENSAJE_SIN_HIDRATADOR } };

  try {
    // `.then` y no la llamada directa: un hidratador que lanza SIN promesa
    // también tiene que acabar en su sección, no en el `Promise.all`.
    const data = await conLimite(Promise.resolve().then(() => h(hueco)), ms);
    if (data === null) return null;
    // El kind es el del hueco y los datos los dio SU hidratador: la pareja la
    // garantiza el tipo `Hidratadores`, y el validador la vuelve a comprobar.
    return { ...base, kind: hueco.kind, data } as AnySection;
  } catch {
    return { ...base, kind: "error", data: { mensaje: MENSAJE_FALLO } };
  }
}

export async function ensamblarPantalla(
  plan: ScreenPlan,
  hidratadores: Hidratadores,
  opciones: { tiempoMs?: number } = {}
): Promise<Screen> {
  const ms = opciones.tiempoMs ?? TIEMPO_POR_SECCION_MS;
  const secciones = await Promise.all(plan.huecos.map((h) => hidratar(h, hidratadores, ms)));

  return {
    id: plan.id,
    intent: plan.intent.kind,
    title: plan.title,
    ...(plan.subtitle ? { subtitle: plan.subtitle } : {}),
    layout: { densidad: "aireada" },
    sections: secciones.filter((s): s is AnySection => s !== null),
    actions: plan.actions,
    refreshPolicy: plan.refreshPolicy,
    permissions: { lectura: true, escritura: false }
  };
}
