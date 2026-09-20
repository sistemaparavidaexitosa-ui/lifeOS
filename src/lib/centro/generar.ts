import "server-only";
import { z } from "zod";
import { generateJson, CENTRO_BUDGET, type GeminiSchema } from "@/lib/ai/gemini-provider";
import type { InsightContext } from "@/lib/insights/context";
import { TIPOS_DEL_CENTRO } from "@/lib/domain/coach/proposals.ts";
import type { PropuestaCruda } from "@/lib/domain/coach/proposals.ts";
import type { Franja } from "@/lib/domain/centro/franja.ts";

/**
 * Lo que el centro le pide al modelo (D-167).
 *
 * TRES FRASES, NO UN ANÁLISIS. El centro se lee de pasada, al abrir la
 * aplicación: si esto devuelve párrafos, la pantalla deja de ser una puerta.
 *
 * NUNCA LANZA: `generateJson` ya cumple ese contrato y aquí no se rompe.
 */

const COMO_HABLA: Record<Franja, string> = {
  manana: "Es por la mañana: la persona está empezando. Propón por dónde arrancar.",
  tarde: "Es por la tarde: la persona ya lleva medio día. Propón continuar algo o cerrar algo abierto.",
  noche: "Es de noche: propón cerrar el día o dejar preparado mañana. No propongas empezar algo grande."
};

function system(franja: Franja, destinos: string[]): string {
  return [
    "Eres la voz del centro de LifeOS. Escribes en español, de tú, en frases cortas.",
    COMO_HABLA[franja],
    "",
    "REGLAS QUE NO SE NEGOCIAN:",
    "1. Como mucho TRES sugerencias, y menos si no hay motivo para tres. Ninguna es mejor que una inventada.",
    "2. NO CALCULAS. Cada cifra que escribas tiene que estar literalmente en los hechos que te doy.",
    "   Si no hay un hecho que lo respalde, no lo digas.",
    "3. El `motivo` es la razón en cinco o seis palabras, con su cifra: «12 movimientos esta semana».",
    "4. Para `foco`, el `href` tiene que ser uno de estos destinos, tal cual:",
    `   ${destinos.join(", ")}`,
    "   Para un proyecto concreto: /execution?project=<id del proyecto, copiado de los hechos>.",
    "   Si no estás seguro del destino, no propongas `foco`.",
    "5. El título es lo que la persona haría, no una descripción: «Sigue con Rediseño», «Abre Dinero».",
    "6. No repitas lo que ya está en «ya propuesto hoy».",
    "7. Escribe además un `resumen`: DOS O TRES FRASES sobre cómo va el día, como se lo dirías a alguien",
    "   que vuelve a su mesa. Qué se movió, qué lleva parado, dónde está su atención. Máximo 280 caracteres.",
    "   Vale la misma regla: cada cifra que cites tiene que estar en los hechos. Si no hay nada que contar,",
    "   devuelve el resumen vacío — mejor callarse que rellenar."
  ].join("\n");
}

function prompt(context: InsightContext, yaPropuestas: string[], proyectos: { id: string; title: string }[]): string {
  const hechos = context.facts.map((f) => `- [${f.id}] ${f.label}`).join("\n") || "- (sin hechos)";
  const lista = proyectos.map((p) => `- ${p.title} → /execution?project=${p.id}`).join("\n") || "- (sin proyectos)";
  const ya = yaPropuestas.length ? yaPropuestas.map((t) => `- ${t}`).join("\n") : "- (nada)";
  return `HECHOS DE HOY\n${hechos}\n\nPROYECTOS\n${lista}\n\nYA PROPUESTO HOY\n${ya}`;
}

const ESQUEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    resumen: {
      type: "STRING",
      description: "Dos o tres frases sobre cómo va el día, máximo 280 caracteres. Vacío si no hay nada que contar."
    },
    sugerencias: {
      type: "ARRAY",
      description: "Como mucho tres. Vacío si no hay nada que valga la pena decir.",
      items: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING", enum: [...TIPOS_DEL_CENTRO], format: "enum", description: "foco lleva a una pantalla; tarea y bloque crean algo." },
          titulo: { type: "STRING", description: "Lo que la persona haría. Máximo 90 caracteres." },
          detalle: { type: "STRING", description: "Vacío casi siempre. El motivo va en datos.motivo." },
          datos: {
            type: "STRING",
            description: 'JSON en texto. Para foco: {"href":"/money","motivo":"4 días de quincena"}. Para tarea: {}. Para bloque: {"title":"...","start":"07:00","end":"08:00"}.'
          }
        },
        required: ["tipo", "titulo", "datos"]
      }
    }
  },
  required: ["sugerencias", "resumen"]
};

const Respuesta = z.object({
  resumen: z.string().optional(),
  sugerencias: z
    .array(
      z.object({
        tipo: z.string(),
        titulo: z.string(),
        detalle: z.string().optional(),
        datos: z.string().optional()
      })
    )
    .max(10)
});

export type ResultadoGeneracion =
  | { ok: true; crudas: PropuestaCruda[]; resumen: string }
  | { ok: false; reason: string };

/** Lo que cabe bajo el saludo sin empujar el resto de la pantalla fuera. */
const MAX_RESUMEN = 280;

export async function generarSugerencias(input: {
  context: InsightContext;
  franja: Franja;
  destinos: string[];
  proyectos: { id: string; title: string }[];
  yaPropuestas: string[];
}): Promise<ResultadoGeneracion> {
  const result = await generateJson({
    system: system(input.franja, input.destinos),
    prompt: prompt(input.context, input.yaPropuestas, input.proyectos),
    schema: ESQUEMA,
    budget: CENTRO_BUDGET,
    validate: (raw) => {
      const parsed = Respuesta.safeParse(raw);
      return parsed.success
        ? ({ ok: true, value: parsed.data } as const)
        : ({ ok: false, reason: "El modelo no devolvió sugerencias con la forma esperada." } as const);
    }
  });

  if (!result.ok || !result.data) return { ok: false, reason: result.reason ?? "El modelo no contestó." };

  return {
    ok: true,
    resumen: (result.data.resumen ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_RESUMEN),
    crudas: result.data.sugerencias.map(
      (s): PropuestaCruda => ({ tipo: s.tipo, titulo: s.titulo, detalle: s.detalle ?? "", datos: s.datos ?? "{}" })
    )
  };
}
