// src/lib/domain/centro/agente/propuesta-movimiento.ts
// De la propuesta del modelo a la sección que la persona confirma (D-202).
// Pura, probada en tests/domain/centro-agente-propuesta.test.ts.
//
// El nombre y la moneda salen de la FILA LEÍDA, no del modelo: lo único suyo
// es el tipo, el monto que la persona dictó, la fecha y la nota. Una fila que
// no se leyó en este turno —inventada, o de otra persona— no se propone.

import { addDaysISO } from "../../datetime.ts";
import { round2 } from "../../budget.ts";
import type { TipoDeMovimiento } from "../../money/curva-inversion.ts";
import { recortar } from "../runtime/secciones.ts";
import type { AnySection } from "../runtime/types.ts";

export const MAX_DIAS_ATRAS = 3653;

export interface BloquePropuesta {
  kind: "propuesta_movimiento";
  fila: string;
  tipo: TipoDeMovimiento;
  monto: number;
  fecha: string | null;
  nota: string | null;
}

export function resolverPropuesta(
  b: BloquePropuesta,
  id: string,
  ctx: { filas: ReadonlyMap<string, Record<string, unknown>>; hoy: string; moneda: string }
): { ok: true; seccion: AnySection } | { ok: false; reason: string } {
  const r = ctx.filas.get(b.fila);
  if (!r) return { ok: false, reason: `«propuesta_movimiento»: ${b.fila} no se leyó en este turno.` };
  const fecha = b.fecha ?? ctx.hoy;
  if (fecha > ctx.hoy) return { ok: false, reason: "«propuesta_movimiento»: fecha futura." };
  if (fecha < addDaysISO(ctx.hoy, -MAX_DIAS_ATRAS)) return { ok: false, reason: "«propuesta_movimiento»: fecha de hace más de diez años." };
  const nombre = typeof r.name === "string" && r.name.trim() ? r.name.trim() : null;
  if (!nombre) return { ok: false, reason: "«propuesta_movimiento»: la fila no trae nombre." };
  const moneda = typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency) ? r.currency : ctx.moneda;
  return {
    ok: true,
    seccion: {
      id,
      kind: "propuestaMovimiento",
      data: {
        investmentId: b.fila.slice("fila:investments:".length),
        posicion: recortar(nombre, 120),
        moneda,
        tipo: b.tipo,
        monto: round2(b.monto),
        fecha,
        nota: b.nota?.trim() ? b.nota.trim() : null
      }
    }
  };
}
