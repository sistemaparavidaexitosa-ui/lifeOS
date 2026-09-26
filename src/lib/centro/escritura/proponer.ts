// src/lib/centro/escritura/proponer.ts
// Del bloque `propuesta_cambio` a la tarjeta (D-203). SERVIDOR.
//
// Cada cambio válido se guarda como propuesta pendiente ANTES de enseñarse: la
// tarjeta solo lleva ids, y lo que se escribe al pulsar Guardar es lo que
// quedó aquí, no lo que diga el navegador.
import "server-only";
import type { Cerebro } from "@/lib/ai-chat/cerebro";
import type { AnySection } from "@/lib/domain/centro/runtime/types.ts";
import { validarCambio, aGuardar, type CambioGuardado } from "@/lib/domain/centro/escritura/cambio.ts";
import { seccionDeCambios, tituloDeCambio } from "@/lib/domain/centro/escritura/tarjeta.ts";
import { ESCRITURA_POR_TABLA } from "@/lib/domain/centro/escritura/registro.ts";

const VERBO = { crear: "Crear", editar: "Cambiar", borrar: "Borrar" } as const;

export async function proponerCambios(
  b: { cambios: unknown[] },
  id: string,
  cerebro: Cerebro,
  filas: ReadonlyMap<string, Record<string, unknown>>,
  cupo: { restantes: number }
): Promise<AnySection[]> {
  // Validar y reservar cupo ANTES del primer await: los bloques se resuelven
  // en paralelo y el tope de 10 por turno es de todos juntos.
  const validos: CambioGuardado[] = [];
  for (const crudo of b.cambios) {
    const r = validarCambio(crudo, { filas, autorizados: cerebro.dominios });
    if (!r.ok) {
      console.warn("[centro-agente] cambio descartado:", r.reason);
      continue;
    }
    if (r.cambio.ignorados.length) console.warn("[centro-agente] campos ignorados:", r.cambio.tabla, r.cambio.ignorados);
    if (cupo.restantes <= 0) {
      console.warn("[centro-agente] cambio descartado: más de 10 cambios en el turno.");
      continue;
    }
    cupo.restantes -= 1;
    validos.push(aGuardar(r.cambio));
  }

  const items: { propuestaId: string; cambio: CambioGuardado }[] = [];
  for (const cambio of validos) {
    const { data, error } = await cerebro.supabase
      .from("coach_proposals")
      .insert({
        user_id: cerebro.user.id,
        message_id: null,
        origen: "centro",
        tipo: "cambio",
        titulo: tituloDeCambio(cambio),
        detalle: `${VERBO[cambio.operacion]} · ${ESCRITURA_POR_TABLA[cambio.tabla].etiqueta}`,
        payload: cambio as unknown as Record<string, never>
      })
      .select("id")
      .single();
    if (data) items.push({ propuestaId: data.id, cambio });
    else console.warn("[centro-agente] no se pudo guardar el cambio propuesto:", error);
  }

  const s = seccionDeCambios(id, items, filas);
  return s ? [s] : [];
}
