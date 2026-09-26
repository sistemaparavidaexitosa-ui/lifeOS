// src/lib/domain/centro/agente/chips.ts
// Lo que el Centro sabe hacer, en frases de ejemplo (D-204). Puro, probado en
// tests/domain/centro-agente-chips.test.ts.
//
// SOLO LO QUE YA SABE HACER. Un chip que el Centro no puede cumplir enseña
// una capacidad falsa. Cuando lleguen el resto de tablas (B) y el diario (C),
// sus chips entran aquí.
import type { Domain } from "../../insights/types.ts";
import type { Franja } from "../franja.ts";

export interface Chip {
  id: string;
  dominio: Domain | null;
  texto: string;
  franja?: Franja;
}

export const CAPACIDADES_VISIBLES: readonly Chip[] = [
  { id: "hoy", dominio: null, texto: "¿Qué hago hoy?", franja: "manana" },
  { id: "cierre", dominio: null, texto: "¿Cómo me fue hoy?", franja: "noche" },
  { id: "desayuno", dominio: "nutrition", texto: "Registra lo que desayuné", franja: "manana" },
  { id: "comida", dominio: "nutrition", texto: "Registra lo que comí", franja: "tarde" },
  { id: "cena", dominio: "nutrition", texto: "Registra lo que cené", franja: "noche" },
  { id: "macros", dominio: "nutrition", texto: "¿Cómo voy con mis macros hoy?" },
  { id: "tarea-nueva", dominio: "execution", texto: "Apunta una tarea en mi proyecto" },
  { id: "pendientes", dominio: "execution", texto: "¿Qué tareas tengo pendientes?" },
  { id: "nota", dominio: "execution", texto: "Guarda una nota en mi cuaderno" },
  { id: "inversiones", dominio: "money", texto: "¿Cómo van mis inversiones?" },
  { id: "aportacion", dominio: "money", texto: "Registra una aportación a mi inversión" },
  { id: "watchlist", dominio: "money", texto: "¿Cómo está mi watchlist?" },
  { id: "metas", dominio: "growth", texto: "¿Qué metas tengo activas?" }
];

export const IDS_DE_CHIPS: ReadonlySet<string> = new Set(CAPACIDADES_VISIBLES.map((c) => c.id));

const MAX_CHIPS = 6;

export function elegirChips(e: { dominios: readonly Domain[]; franja: Franja; usos: Record<string, number> }): { id: string; texto: string }[] {
  return CAPACIDADES_VISIBLES.map((c, i) => ({ c, i }))
    .filter(({ c }) => (c.dominio === null || e.dominios.includes(c.dominio)) && (!c.franja || c.franja === e.franja))
    .sort((a, b) => (e.usos[b.c.id] ?? 0) - (e.usos[a.c.id] ?? 0) || a.i - b.i)
    .slice(0, MAX_CHIPS)
    .map(({ c }) => ({ id: c.id, texto: c.texto }));
}
