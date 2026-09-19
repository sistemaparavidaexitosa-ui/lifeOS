// src/lib/identity/generar.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { BRIEF_BUDGET, generateJson } from "@/lib/ai/gemini-provider";
import type { SourceSnapshot } from "@/lib/domain/development/goals.ts";
import { sanearBrief, LIMITES_RESPALDO, type Brief } from "@/lib/domain/identity/brief.ts";
import { preferenciasParaElPrompt } from "@/lib/domain/identity/estilo.ts";
import { loadContextoDelBrief, DOMINIOS_DEL_BRIEF, type ContextoDelBrief } from "./agent-context";
import { BRIEF_RESPONSE_SCHEMA, BriefSchema, promptDelBrief, systemDelBrief, type DatosDelBrief } from "./prompt";

type Db = SupabaseClient<Database>;

export { DOMINIOS_DEL_BRIEF };

export interface BriefGenerado {
  ok: boolean;
  brief?: Brief;
  model?: string;
  factCount?: number;
  intentos?: number;
  reason?: string;
}

/**
 * EL RESPALDO. Genera el brief de HOY con el modelo, desde aquí, sin guardarlo.
 *
 * Desde D-164 esto ya no es el camino normal: normalmente escribe el agente
 * Python y esto corre cuando aquel no contesta. Sigue pidiendo CINCO
 * afirmaciones y una escena de dos a cuatro minutos —`LIMITES_RESPALDO`— y con
 * el mismo presupuesto de tokens de siempre. No es un descuido: un respaldo que
 * cuesta lo mismo que el agente es un segundo agente al que mantener, y lo que
 * tiene que garantizar es que la persona no se queda sin brief, no que no note
 * la diferencia.
 *
 * NUNCA LANZA (D-021): cualquier fallo vuelve como `reason` legible.
 *
 * Un reintento como mucho, y solo si el saneado encontró algo que corregir
 * (afirmaciones repetidas, cita atribuida, piezas vacías). El reintento lleva
 * los problemas escritos para que el modelo sepa qué cambiar, no una tirada
 * más a ciegas.
 */
export async function generarBrief(opts: {
  supabase: Db;
  userId: string;
  today: string;
  timeZone: string;
  sources: SourceSnapshot;
  /** El contexto ya reunido, si quien llama acaba de cargarlo. Evita repetir una docena de consultas. */
  contexto?: ContextoDelBrief;
}): Promise<BriefGenerado> {
  try {
    return await generar(opts);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "No se pudo generar el brief." };
  }
}

async function generar({ supabase, userId, today, timeZone, sources, contexto }: Parameters<typeof generarBrief>[0]): Promise<BriefGenerado> {
  let ctx = contexto;
  if (!ctx) {
    const cargado = await loadContextoDelBrief({ supabase, userId, today, timeZone, sources, modo: "sesion" });
    if (!cargado.ok) return { ok: false, reason: cargado.reason };
    ctx = cargado.contexto;
  }

  const datos: DatosDelBrief = { ...ctx.datos, estilo: preferenciasParaElPrompt(ctx.estilo) };

  let modelo: string | undefined;
  let respaldo: Brief | null = null;
  let correcciones: DatosDelBrief["correcciones"];
  for (let intento = 1; intento <= 2; intento++) {
    const result = await generateJson({
      system: systemDelBrief(ctx.preferencias.tono, ctx.preferencias.inspiraciones),
      prompt: promptDelBrief({ ...datos, correcciones }),
      schema: BRIEF_RESPONSE_SCHEMA,
      budget: BRIEF_BUDGET,
      validate: (raw) => {
        const parsed = BriefSchema.safeParse(raw);
        return parsed.success
          ? ({ ok: true, value: parsed.data } as const)
          : ({ ok: false, reason: "El modelo no devolvió un brief con la forma esperada." } as const);
      }
    });
    modelo = result.model ?? modelo;
    if (!result.ok || !result.data) {
      if (respaldo) break;
      return { ok: false, reason: result.reason, model: modelo, intentos: intento };
    }

    const saneado = sanearBrief(result.data, ctx.saneado, LIMITES_RESPALDO);
    if (saneado.ok && saneado.problemas.length === 0) {
      return { ok: true, brief: saneado.brief, model: modelo, factCount: ctx.factCount, intentos: intento };
    }
    // Un brief que se sostiene con algún defecto menor (una afirmación de
    // menos, la cita fuera) queda de respaldo; el reintento lleva escrito qué
    // corregir.
    if (saneado.ok) respaldo = saneado.brief!;
    correcciones = { problemas: saneado.problemas, rechazadas: saneado.rechazadas };
  }

  if (respaldo) return { ok: true, brief: respaldo, model: modelo, factCount: ctx.factCount, intentos: 2 };
  return {
    ok: false,
    reason: "La IA no consiguió un brief que no repitiera días anteriores. Inténtalo de nuevo en un rato.",
    model: modelo,
    intentos: 2
  };
}

/** Para `audit_log`: cuántos hechos de identidad y de dominio hubo, sin los textos. */
export function resumenParaAuditoria(g: BriefGenerado): Record<string, unknown> {
  return { model: g.model ?? null, facts: g.factCount ?? 0, intentos: g.intentos ?? 0, domains: DOMINIOS_DEL_BRIEF };
}
