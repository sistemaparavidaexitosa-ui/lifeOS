// src/lib/domain/centro/agente/contrato.ts
// Lo que el agente de interfaz puede decir (D-194). Puro, probado en
// tests/domain/centro-agente-contrato.test.ts.
//
// EL AGENTE NO ESCRIBE VALORES, ESCRIBE REFERENCIAS. Un bloque genérico no dice
// «saldo: $4,000»: dice «la columna `balance` de `fila:debts:<uuid>`», y el
// servidor lee el valor de la fila que las herramientas le entregaron en ESTE
// turno. Es la misma idea que `factIds` en el chat, llevada a la interfaz: lo
// que no se leyó no se puede enseñar.
//
// POR QUÉ `datos` ES UNA CADENA JSON. El `responseSchema` de Gemini no admite
// uniones discriminadas; un esquema que fingiera que las once formas son la
// misma dejaría pasar cualquier cosa. Así que el modelo devuelve
// `{ kind, datos: "<JSON>" }` —como `coach_proposals`— y la forma real se
// comprueba aquí, kind por kind.
//
// UN BLOQUE MALO NO TUMBA EL TURNO. Se descarta con motivo (para el log) y el
// resto sigue. Sin texto, en cambio, no hay turno: el texto es lo único que
// siempre se enseña.

import { z } from "zod";
import type { GeminiSchema } from "../../ai/tools.ts";
import { TIPOS_DEL_CENTRO } from "../../coach/proposals.ts";
import { tieneCifras } from "./texto.ts";

export const MAX_BLOQUES = 4;
const MAX_TEXTO = 600;

export const GENERICOS = ["lista", "metricas", "tabla", "grafica", "tarjetas", "linea"] as const;
export const CAPACIDADES = ["mercado", "hoy", "inversiones"] as const;
export const KINDS_DEL_AGENTE = [...GENERICOS, "ir_a", "recomendaciones", "insight", ...CAPACIDADES] as const;

export const FORMATOS = ["numero", "dinero", "porcentaje", "fecha", "texto"] as const;
export type Formato = (typeof FORMATOS)[number];

/** `fila:<tabla>:<id>`: el id que `consultar` pone a cada fila (`idDeFila`). */
const fila = z.string().regex(/^fila:[a-z_]+:[A-Za-z0-9-]+$/);
/** Un nombre de columna y nada más: ni puntos, ni espacios, ni expresiones. */
const campo = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const etiqueta = z.string().trim().min(1).max(60);
const titulo = z.string().trim().min(1).max(80);
const formato = z.enum(FORMATOS);

const ESQUEMAS_GENERICOS = {
  lista: z
    .object({
      titulo,
      items: z.array(z.object({ fila, titulo: campo, detalle: campo.nullable(), estado: campo.nullable() }).strict()).min(1).max(8)
    })
    .strict(),
  metricas: z
    .object({
      titulo: titulo.nullable(),
      items: z.array(z.object({ etiqueta, fila, campo, formato }).strict()).min(1).max(4)
    })
    .strict(),
  tabla: z
    .object({
      titulo,
      columnas: z.array(z.object({ etiqueta, campo, formato }).strict()).min(1).max(4),
      filas: z.array(fila).min(1).max(10)
    })
    .strict(),
  grafica: z
    .object({
      titulo,
      tipo: z.enum(["linea", "barras"]),
      campoX: campo,
      campoY: campo,
      formato,
      filas: z.array(fila).min(2).max(31)
    })
    .strict(),
  tarjetas: z
    .object({
      titulo,
      items: z.array(z.object({ fila, titulo: campo, detalle: campo.nullable() }).strict()).min(1).max(4)
    })
    .strict(),
  linea: z
    .object({
      titulo,
      items: z.array(z.object({ fila, fecha: campo, titulo: campo }).strict()).min(1).max(8)
    })
    .strict()
} as const;

const ESQUEMA_IR_A = z
  .object({ destinos: z.array(z.object({ etiqueta: z.string().trim().min(1).max(40), href: z.string().max(300) }).strict()).min(1).max(3) })
  .strict();

const ESQUEMA_RECOMENDACIONES = z
  .object({
    items: z
      .array(
        z
          .object({
            tipo: z.enum(TIPOS_DEL_CENTRO as unknown as [string, ...string[]]),
            titulo: z.string().trim().min(1).max(90),
            motivo: z.string().trim().min(1).max(160),
            /** JSON en texto, como `PropuestaCruda.datos`: lo sanea `sanearPropuesta`. */
            datos: z.string().max(2000)
          })
          .strict()
      )
      .min(1)
      .max(3)
  })
  .strict();

const ESQUEMA_INSIGHT = z.object({ texto: z.string().trim().min(1).max(240) }).strict();

type Genericos = typeof ESQUEMAS_GENERICOS;
export type BloqueGenerico = { [K in keyof Genericos]: { kind: K } & z.infer<Genericos[K]> }[keyof Genericos];

export type BloqueDelAgente =
  | BloqueGenerico
  | ({ kind: "ir_a" } & z.infer<typeof ESQUEMA_IR_A>)
  | ({ kind: "recomendaciones" } & z.infer<typeof ESQUEMA_RECOMENDACIONES>)
  | ({ kind: "insight" } & z.infer<typeof ESQUEMA_INSIGHT>)
  | { kind: "capacidad"; nombre: (typeof CAPACIDADES)[number]; parametros: Record<string, unknown> };

export interface RespuestaDelAgente {
  texto: string;
  bloques: BloqueDelAgente[];
  /** Por qué se cayó cada bloque descartado. Va al log, nunca a la persona. */
  descartados: string[];
}

function leerJson(datos: unknown): Record<string, unknown> | null {
  if (typeof datos !== "string") return null;
  try {
    const v: unknown = JSON.parse(datos.trim() || "{}");
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * El primer rótulo (título o etiqueta) que el MODELO escribió con una cifra.
 * Un rótulo se lee como parte de la interfaz, igual que un insight: «Ahorraste
 * $3,000» encima de una tabla se confunde con un valor calculado. Un conteo
 * suelto («Top 5 tareas») no es cifra y pasa.
 */
function rotuloConCifras(b: BloqueDelAgente): string | null {
  const rotulos: string[] = [];
  if ("titulo" in b && typeof b.titulo === "string") rotulos.push(b.titulo);
  if (b.kind === "metricas") rotulos.push(...b.items.map((i) => i.etiqueta));
  if (b.kind === "tabla") rotulos.push(...b.columnas.map((c) => c.etiqueta));
  if (b.kind === "ir_a") rotulos.push(...b.destinos.map((d) => d.etiqueta));
  return rotulos.find((r) => tieneCifras(r)) ?? null;
}

function parsearBloque(crudo: unknown): { ok: true; bloque: BloqueDelAgente } | { ok: false; reason: string } {
  const c = (crudo ?? {}) as { kind?: unknown; datos?: unknown };
  const kind = typeof c.kind === "string" ? c.kind : "";
  const datos = leerJson(c.datos);
  if (!datos) return { ok: false, reason: `«${kind || "?"}»: datos no es un objeto JSON.` };

  if ((CAPACIDADES as readonly string[]).includes(kind)) {
    return { ok: true, bloque: { kind: "capacidad", nombre: kind as (typeof CAPACIDADES)[number], parametros: datos } };
  }

  const esquema =
    kind in ESQUEMAS_GENERICOS
      ? ESQUEMAS_GENERICOS[kind as keyof Genericos]
      : kind === "ir_a"
        ? ESQUEMA_IR_A
        : kind === "recomendaciones"
          ? ESQUEMA_RECOMENDACIONES
          : kind === "insight"
            ? ESQUEMA_INSIGHT
            : null;
  if (!esquema) return { ok: false, reason: `«${kind || "?"}» no es un bloque del catálogo.` };

  const r = esquema.safeParse(datos);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, reason: `«${kind}»: ${i?.path.join(".") || "datos"} ${i?.message ?? "inválido"}.` };
  }
  const bloque = { kind, ...r.data } as BloqueDelAgente;
  const conCifras = rotuloConCifras(bloque);
  if (conCifras !== null) return { ok: false, reason: `«${kind}»: el rótulo «${conCifras}» lleva cifras.` };
  return { ok: true, bloque };
}

export function parsearRespuesta(raw: unknown): { ok: true; value: RespuestaDelAgente } | { ok: false; reason: string } {
  const r = raw as { texto?: unknown; bloques?: unknown } | null;
  const texto = typeof r?.texto === "string" ? r.texto.trim().slice(0, MAX_TEXTO) : "";
  if (!texto) return { ok: false, reason: "La respuesta no trae texto." };

  const crudos = Array.isArray(r?.bloques) ? r.bloques : [];
  const bloques: BloqueDelAgente[] = [];
  const descartados: string[] = [];
  for (const c of crudos) {
    if (bloques.length >= MAX_BLOQUES) {
      descartados.push(`Más de ${MAX_BLOQUES} bloques: se ignora el resto.`);
      break;
    }
    const p = parsearBloque(c);
    if (p.ok) bloques.push(p.bloque);
    else descartados.push(p.reason);
  }
  return { ok: true, value: { texto, bloques, descartados } };
}

export const ESQUEMA_RESPUESTA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    texto: { type: "STRING", description: "Una a tres frases para la persona." },
    bloques: {
      type: "ARRAY",
      description: `Como mucho ${MAX_BLOQUES}. Vacío si basta con el texto.`,
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", format: "enum", enum: [...KINDS_DEL_AGENTE] },
          datos: { type: "STRING", description: "Objeto JSON con la forma del kind, en texto." }
        },
        required: ["kind", "datos"],
        propertyOrdering: ["kind", "datos"]
      }
    }
  },
  required: ["texto", "bloques"],
  propertyOrdering: ["texto", "bloques"]
};
