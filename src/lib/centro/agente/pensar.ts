// src/lib/centro/agente/pensar.ts
// Un turno del agente de interfaz, de punta a punta (D-194). SERVIDOR.
import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { generateJson, type Budget } from "@/lib/ai/gemini-provider";
import { prepararCerebro, type Cerebro } from "@/lib/ai-chat/cerebro";
import { parsearRespuesta, ESQUEMA_RESPUESTA, type BloqueDelAgente } from "@/lib/domain/centro/agente/contrato.ts";
import { resolverBloque, proyectosVistos } from "@/lib/domain/centro/agente/resolver.ts";
import { SYSTEM_AGENTE, promptDelTurno } from "@/lib/domain/centro/agente/prompt.ts";
import { componerTurno, prefijarSecciones } from "@/lib/domain/centro/agente/turno.ts";
import { tieneCifras } from "@/lib/domain/centro/agente/texto.ts";
import { destinoValido } from "@/lib/domain/centro/sugerencias.ts";
import { sanearRecomendacion } from "@/lib/domain/centro/agente/recomendaciones.ts";
import { textoDelContexto } from "@/lib/insights/context";
import { conLimite } from "@/lib/domain/centro/runtime/ensamblar.ts";
import type { AnySection } from "@/lib/domain/centro/runtime/types.ts";
import { CAPACIDADES_REGISTRADAS } from "./capacidades";

/** Lo que aporta un bloque: sus secciones y los proyectos que sus lecturas vieron. */
interface Aporte {
  secciones: AnySection[];
  proyectos: { id: string }[];
}

const CENTRO_AGENTE_BUDGET: Budget = { maxOutputTokens: 3000, thinkingBudget: 256 };
const TIEMPO_CAPACIDAD_MS = 8000;
export const DISCULPA = "No pude pensar esto ahora; inténtalo de nuevo.";

/**
 * NUNCA LANZA (mismo contrato que `chatReply` y el resto de llamadas al
 * modelo, D-021): una excepción inesperada —`prepararCerebro` sin red, un
 * `throw` que ninguna de las puertas de abajo esperaba— tiene que acabar en
 * la disculpa de siempre, con 200, no en un 500 que la ruta no sabría cómo
 * explicar.
 */
export async function pensarTurno(input: { texto: string; historial: { rol: "persona" | "agente"; texto: string }[] }) {
  const id = randomUUID();
  try {
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
    auditarBusquedas(cerebro, r.toolRounds ?? 0);
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
          const caida: Aporte = { secciones: [{ id: `b${i}`, kind: "error", data: { mensaje: "No se pudo cargar esta parte." } }], proyectos: [] };
          return caida;
        })
      )
    );

    // Los proyectos que se pueden enlazar: los de las filas de las
    // herramientas MÁS los que vieron las capacidades (el grafo de «Hoy»).
    const enlazables = new Map(proyectos.map((p) => [p.id, p]));
    for (const a of porBloque) for (const p of a.proyectos) enlazables.set(p.id, p);

    const secciones = porBloque.flatMap((a) => a.secciones);
    const turno = componerTurno({ texto: r.data.texto, secciones, proyectos: [...enlazables.values()] });

    // Una recomendación ya se guardó como propuesta pendiente antes de validar
    // su sección: si la sección no sale, que quede en el log cuáles son.
    for (const s of secciones) {
      if (s.kind === "recomendaciones" && !turno.secciones.some((t) => t.id === s.id)) {
        console.warn("[centro-agente] recomendaciones guardadas pero no enseñadas:", s.data.items.map((it) => it.propuestaId));
      }
    }

    return { id, ...turno };
  } catch (e) {
    console.warn("[centro-agente] el turno falló:", e);
    return { id, texto: DISCULPA, secciones: [] as AnySection[] };
  }
}

async function resolverUno(
  b: BloqueDelAgente,
  id: string,
  ctx: Parameters<typeof resolverBloque>[2],
  proyectos: { id: string }[],
  cerebro: Cerebro
): Promise<Aporte> {
  if (b.kind === "capacidad") {
    const r = await conLimite(CAPACIDADES_REGISTRADAS[b.nombre](b.parametros, cerebro), TIEMPO_CAPACIDAD_MS);
    // El id de sección de una capacidad es fijo (`mercado-watchlist`…): si el
    // modelo pide la misma capacidad dos veces en el turno, dos ids iguales
    // chocarían. Anteponer el id del bloque los vuelve a hacer únicos.
    return { secciones: prefijarSecciones(r.secciones, id), proyectos: r.proyectos };
  }
  return { secciones: await resolverSinCapacidad(b, id, ctx, proyectos, cerebro), proyectos: [] };
}

async function resolverSinCapacidad(
  b: Exclude<BloqueDelAgente, { kind: "capacidad" }>,
  id: string,
  ctx: Parameters<typeof resolverBloque>[2],
  proyectos: { id: string }[],
  cerebro: Cerebro
): Promise<AnySection[]> {
  switch (b.kind) {
    case "ir_a": {
      const destinos = b.destinos.filter((d) => destinoValido(d.href, proyectos));
      return destinos.length ? [{ id, kind: "irA", data: { destinos } }] : [];
    }
    case "insight":
      return tieneCifras(b.texto) ? [] : [{ id, kind: "insight", data: { texto: b.texto } }];
    case "recomendaciones": {
      const items: { propuestaId: string; titulo: string; motivo: string }[] = [];
      for (const it of b.items) {
        const limpia = sanearRecomendacion(it, proyectos);
        if (!limpia) continue;
        const { data, error } = await cerebro.supabase
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
        else console.warn("[centro-agente] no se pudo guardar la recomendación:", error);
      }
      return items.length ? [{ id, kind: "recomendaciones", data: { items } }] : [];
    }
    default: {
      const s = resolverBloque(b, id, ctx);
      return s ? [s] : [];
    }
  }
}

/**
 * Las búsquedas web del turno, al rastro de auditoría —igual que el chat
 * (`sendChatMessage`)—: es lo único que sale hacia un tercero distinto del
 * proveedor del modelo. Solo si hubo alguna, y con `after`: la respuesta no
 * espera al insert.
 */
function auditarBusquedas(cerebro: Cerebro, toolRounds: number) {
  const busquedas = cerebro.herramientas?.busquedas() ?? [];
  if (!busquedas.length) return;
  after(async () => {
    const { error } = await cerebro.supabase.from("audit_log").insert({
      user_id: cerebro.user.id,
      action: "ai.centro_turno",
      object: "centro",
      meta: { busquedas, toolRounds }
    });
    if (error) console.warn("[centro-agente] no se pudo auditar las búsquedas:", error);
  });
}
