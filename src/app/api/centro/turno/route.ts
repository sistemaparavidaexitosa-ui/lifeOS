import { NextResponse } from "next/server";
import { z } from "zod";
import { flagsDelRuntime } from "@/config/env";
import { getSessionUser } from "@/lib/data/session";
import { pensarTurno } from "@/lib/centro/agente/pensar";
import { MAX_HISTORIAL } from "@/lib/domain/centro/agente/hilo.ts";
import type { Action } from "@/lib/domain/centro/runtime/types.ts";

/**
 * Un turno del Centro-agente (D-194). Solo existe con AGENTIC_CENTER_RUNTIME:
 * apagado responde 404, como si no existiera.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Entrada = z.object({
  texto: z.string().trim().min(1).max(2000),
  historial: z.array(z.object({ rol: z.enum(["persona", "agente"]), texto: z.string().max(2000) })).max(MAX_HISTORIAL)
});

export async function POST(req: Request) {
  if (!flagsDelRuntime().runtime) return NextResponse.json({ ok: false, reason: "No encontrado." }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, reason: "Sin sesión." }, { status: 401 });
  const e = Entrada.safeParse(await req.json().catch(() => null));
  if (!e.success) return NextResponse.json({ ok: false, reason: "Entrada inválida." }, { status: 400 });
  const turno = await pensarTurno(e.data);
  // `acciones` es parte del contrato (spec §Respuesta de la ruta): el agente
  // solo PROPONE (recomendaciones), así que hoy va siempre vacío.
  const acciones: Action[] = [];
  return NextResponse.json({ ok: true, turno: { ...turno, acciones } });
}
