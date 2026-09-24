// src/lib/centro/agente/pensar.ts
// Un turno del agente de interfaz, de punta a punta (D-194). SERVIDOR.
import "server-only";
import { randomUUID } from "node:crypto";
import { generateJson, type Budget } from "@/lib/ai/gemini-provider";
import { prepararCerebro, type Cerebro } from "@/lib/ai-chat/cerebro";
import { parsearRespuesta, ESQUEMA_RESPUESTA, type BloqueDelAgente } from "@/lib/domain/centro/agente/contrato.ts";
import { resolverBloque, proyectosVistos } from "@/lib/domain/centro/agente/resolver.ts";
import { SYSTEM_AGENTE, promptDelTurno } from "@/lib/domain/centro/agente/prompt.ts";
import { componerTurno } from "@/lib/domain/centro/agente/turno.ts";
import { tieneCifras } from "@/lib/domain/centro/agente/texto.ts";
import { destinoValido } from "@/lib/domain/centro/sugerencias.ts";
import { sanearPropuesta } from "@/lib/domain/coach/proposals.ts";
import { textoDelContexto } from "@/lib/insights/context";
import { conLimite } from "@/lib/domain/centro/runtime/ensamblar.ts";
import type { AnySection } from "@/lib/domain/centro/runtime/types.ts";
import { CAPACIDADES_REGISTRADAS } from "./capacidades";

const CENTRO_AGENTE_BUDGET: Budget = { maxOutputTokens: 3000, thinkingBudget: 256 };
const TIEMPO_CAPACIDAD_MS = 8000;
export const DISCULPA = "No pude pensar esto ahora; inténtalo de nuevo.";

export async function pensarTurno(input: { texto: string; historial: { rol: "persona" | "agente"; texto: string }[] }) {
  const id = randomUUID();
  const cerebro = await prepararCerebro();
  if (!cerebro) return { id, texto: DISCULPA, secciones: [] as AnySection[] };

  const r = await generateJson({
    system: SYSTEM_AGENTE,
    prompt: promptDelTurno({ contexto: textoDelContexto(cerebro.context), historial: input.historial, texto: input.texto }),
    schema: ESQUEMA_RESPUESTA,
    validate: (raw) => parsearRespuesta(raw),
    budget: CENTRO_AGENTE_BUDGET,
    ...(cerebro.herramientas
      ? { tools: cerebro.herramientas.declaraciones, executeTool: cerebro.herramientas.ejecutar }
      : {})
  });
  if (!r.ok || !r.data) {
    console.warn("[centro-agente] el modelo no contestó:", r.reason);
    return { id, texto: DISCULPA, secciones: [] as AnySection[] };
  }
  for (const d of r.data.descartados) console.warn("[centro-agente] bloque descartado:", d);

  const filas = cerebro.herramientas?.filasEntregadas() ?? new Map();
  const proyectos = proyectosVistos(filas);
  const ctx = { filas, moneda: cerebro.moneda, locale: cerebro.locale };

  const porBloque = await Promise.all(
    r.data.bloques.map((b, i) =>
      resolverUno(b, `b${i}`, ctx, proyectos, cerebro).catch((e: unknown) => {
        console.warn("[centro-agente] bloque falló:", e);
        return [{ id: `b${i}`, kind: "error", data: { mensaje: "No se pudo cargar esta parte." } } as AnySection];
      })
    )
  );

  return { id, ...componerTurno({ texto: r.data.texto, secciones: porBloque.flat(), proyectos }) };
}

async function resolverUno(
  b: BloqueDelAgente,
  id: string,
  ctx: Parameters<typeof resolverBloque>[2],
  proyectos: { id: string }[],
  cerebro: Cerebro
): Promise<AnySection[]> {
  switch (b.kind) {
    case "capacidad":
      return conLimite(CAPACIDADES_REGISTRADAS[b.nombre](b.parametros, cerebro), TIEMPO_CAPACIDAD_MS);
    case "ir_a": {
      const destinos = b.destinos.filter((d) => destinoValido(d.href, proyectos));
      return destinos.length ? [{ id, kind: "irA", data: { destinos } }] : [];
    }
    case "insight":
      return tieneCifras(b.texto) ? [] : [{ id, kind: "insight", data: { texto: b.texto } }];
    case "recomendaciones": {
      const items: { propuestaId: string; titulo: string; motivo: string }[] = [];
      for (const it of b.items) {
        if (tieneCifras(it.motivo)) continue;
        const limpia = sanearPropuesta({ tipo: it.tipo, titulo: it.titulo, detalle: it.motivo, datos: it.datos });
        if (!limpia) continue;
        const { data } = await cerebro.supabase
          .from("coach_proposals")
          .insert({
            user_id: cerebro.user.id,
            message_id: null,
            origen: "centro",
            tipo: limpia.tipo,
            titulo: limpia.titulo,
            detalle: limpia.detalle,
            payload: limpia.payload
          })
          .select("id")
          .single();
        if (data) items.push({ propuestaId: data.id, titulo: limpia.titulo, motivo: limpia.detalle });
      }
      return items.length ? [{ id, kind: "recomendaciones", data: { items } }] : [];
    }
    default: {
      const s = resolverBloque(b, id, ctx);
      return s ? [s] : [];
    }
  }
}
