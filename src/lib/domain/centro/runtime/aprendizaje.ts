// src/lib/domain/centro/runtime/aprendizaje.ts
// Lo que el Centro podrá recordar de sus pantallas (D-192). Puro, probado en
// tests/domain/centro-runtime-ensamblar.test.ts.
//
// SOLO LA FORMA. En Fase 1 no se guarda nada: el renderer emite estos eventos a
// un `EventSink`, y el que se conecta es `sinkNulo`. Así, el día que exista un
// sink de verdad no hay que tocar ni un componente, solo quién lo recibe.
//
// DÓNDE SE GUARDARÍAN. El precedente es `nav_visitas` (0072, D-183): una fila
// por hecho, ventana de 30 días, y DELETE concedido para que dejar de usar algo
// lo borre solo. Lo que se aprende tiene que poder caducar.
//
// `accionIgnorada` está declarado y nadie lo emite todavía: saber qué se ignoró
// exige saber qué se vio, y eso es visibilidad por sección, no un clic.

import type { SectionKind } from "./secciones.ts";
import type { IntentKind } from "./types.ts";

interface BaseDeEvento {
  screenId: string;
  intentKind: IntentKind;
  /** ISO. */
  en: string;
}

export type ScreenEvent =
  | (BaseDeEvento & { tipo: "abierta" })
  | (BaseDeEvento & { tipo: "descartada" })
  | (BaseDeEvento & { tipo: "tiempo"; ms: number })
  | (BaseDeEvento & { tipo: "accionAceptada"; sectionKind?: SectionKind; href: string })
  | (BaseDeEvento & { tipo: "accionIgnorada"; sectionKind?: SectionKind });

export interface EventSink {
  emitir(e: ScreenEvent): void;
}

export const sinkNulo: EventSink = { emitir() {} };

/** Lo que se emite al cerrar una pantalla: cuánto estuvo abierta y, si no sirvió, que se descartó. */
export function eventosDeCierre(p: {
  screenId: string;
  intentKind: IntentKind;
  abiertaEn: number;
  cerradaEn: number;
  aceptoAlgo: boolean;
}): ScreenEvent[] {
  const base = { screenId: p.screenId, intentKind: p.intentKind, en: new Date(p.cerradaEn).toISOString() };
  const eventos: ScreenEvent[] = [{ ...base, tipo: "tiempo", ms: Math.max(0, p.cerradaEn - p.abiertaEn) }];
  if (!p.aceptoAlgo) eventos.push({ ...base, tipo: "descartada" });
  return eventos;
}
