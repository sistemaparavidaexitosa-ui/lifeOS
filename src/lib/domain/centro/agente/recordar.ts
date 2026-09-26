// src/lib/domain/centro/agente/recordar.ts
// Cómo guarda el Centro lo que aprendió (D-204). Puro, probado en
// tests/domain/centro-agente-recordar.test.ts.
//
// SIN PREGUNTAR, PERO CON LÍMITES: caduca a los 90 días, no pasa de 20 activas
// (se va la más vieja DEL CENTRO; las de la persona no se tocan nunca) y no
// repite algo que ya está en la memoria, lo haya escrito quien lo haya escrito.
import { addDaysISO } from "../../datetime.ts";
import type { MemoryScope } from "../../insights/memory.ts";

export const MAX_MEMORIA_CENTRO = 20;
export const DIAS_MEMORIA_CENTRO = 90;

export function normalizarMemoria(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?¡¿;:,]+$/g, "")
    .trim();
}

interface Existente {
  id: string;
  text: string;
  origin: string;
  created_at: string;
  valid_until: string | null;
}

export function planDeRecordar(
  nuevo: { texto: string; ambito: MemoryScope },
  existentes: Existente[],
  hoy: string
):
  | { accion: "omitir"; motivo: string }
  | { accion: "guardar"; fila: { text: string; scope: MemoryScope; origin: "centro"; valid_until: string }; borrar: string[] } {
  const vigentes = existentes.filter((m) => m.valid_until === null || m.valid_until >= hoy);
  const clave = normalizarMemoria(nuevo.texto);
  if (vigentes.some((m) => normalizarMemoria(m.text) === clave)) return { accion: "omitir", motivo: "ya la recuerdo" };

  const delCentro = vigentes.filter((m) => m.origin === "centro").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sobran = Math.max(0, delCentro.length + 1 - MAX_MEMORIA_CENTRO);
  return {
    accion: "guardar",
    fila: { text: nuevo.texto.trim(), scope: nuevo.ambito, origin: "centro", valid_until: addDaysISO(hoy, DIAS_MEMORIA_CENTRO) },
    borrar: delCentro.slice(0, sobran).map((m) => m.id)
  };
}
