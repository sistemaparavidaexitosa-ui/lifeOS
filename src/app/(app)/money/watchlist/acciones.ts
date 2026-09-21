"use server";
import "server-only";
// La búsqueda, como Server Action: la llave de Polygon no sale del servidor.

import { buscarTickers } from "@/lib/money/polygon";
import type { Resultado, TickerEncontrado } from "@/lib/money/polygon";
import { getSessionUser } from "@/lib/data/session";

export async function buscarTickersAction(q: string): Promise<Resultado<TickerEncontrado[]>> {
  // La llave es de la instalación, no de la persona, así que se exige sesión:
  // sin esto, cualquiera con la URL gastaría la cuota de Polygon.
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Sin sesión." };
  return buscarTickers(q);
}
