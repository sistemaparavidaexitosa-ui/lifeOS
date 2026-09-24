// src/lib/domain/centro/runtime/acciones.ts
// Qué puede hacer un botón de una pantalla (D-188). Puro, probado en
// tests/domain/centro-runtime-validador.test.ts.
//
// DOS COSAS Y NINGUNA MÁS: ir a una pantalla de la aplicación o pedir otra
// pantalla del runtime. Los enlaces pasan por `destinoValido`, la misma puerta
// que las sugerencias del Centro (D-167): una IA que puede escribir una
// dirección externa en un botón de tu aplicación es una IA que puede sacarte
// de ella.

import { destinoValido } from "../sugerencias.ts";
import { INTENT_KINDS, type Action, type IntentKind } from "./types.ts";

const MAX_LABEL = 60;

export function sanearAccion(v: unknown, proyectos: { id: string }[]): Action | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;

  const label = typeof a.label === "string" ? a.label.trim().slice(0, MAX_LABEL) : "";
  if (!label) return null;

  // Las dos a la vez es ambiguo; ninguna, un botón que no hace nada.
  const tieneHref = "href" in a;
  if (tieneHref === "intent" in a) return null;

  if (tieneHref) {
    return typeof a.href === "string" && destinoValido(a.href, proyectos) ? { label, href: a.href } : null;
  }
  return typeof a.intent === "string" && (INTENT_KINDS as readonly string[]).includes(a.intent)
    ? { label, intent: a.intent as IntentKind }
    : null;
}
