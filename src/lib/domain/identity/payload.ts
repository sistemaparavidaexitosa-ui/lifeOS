// src/lib/domain/identity/payload.ts
// La forma EXACTA de lo que el agente Python puede devolver.
//
// Es la frontera del sistema de tipos: al otro lado hay Python, donde `tsc` no
// alcanza. Todo lo que cruce por aquí sin validarse acabaría en `sanearBrief`
// —que espera objetos con la forma de `BriefCrudo`— o, peor, en la base.
//
// TRES DECISIONES QUE PARECEN EXCESO Y NO LO SON:
//
//  · `.strict()` en cada objeto. Una clave de más no es inofensiva: casi
//    siempre significa que los dos lados han derivado y que algo que el agente
//    cree estar mandando se está ignorando en silencio. Mejor un 422 ruidoso.
//  · Arrays acotados. Sin el tope, un bucle en el agente puede mandar diez mil
//    afirmaciones y el coste lo paga la base de datos.
//  · Cotas de longitud generosas pero presentes. `sanearBrief` recorta después;
//    esto solo impide que un texto de un megabyte llegue a recortarse.
//
// Este archivo NO reimplementa el saneado. Valida la FORMA; que el contenido
// sea original, no repetido y esté anclado a hechos reales lo decide
// `sanearBrief`, que es la autoridad (D-164).

import { z } from "zod";
import { PRINCIPIOS } from "./brief.ts";
import { AREAS, CATEGORIAS } from "./categorias.ts";

/** Tope duro de afirmaciones. Coincide con `LIMITES_AGENTE.maxAfirmaciones`. */
export const MAX_AFIRMACIONES = 20;
/** Doce pasos: el arco son nueve tiempos, con margen para que alguno se parta. */
export const MAX_PASOS = 12;

const AfirmacionSchema = z
  .object({
    texto: z.string().min(1).max(400),
    rasgoId: z.string().max(64),
    // La categoría se acepta como cadena libre y la resuelve `categoriaDe`: una
    // categoría que no se reconoce manda la afirmación a «Otras», y eso no es
    // motivo para rechazar el brief entero.
    categoria: z.string().max(40).optional()
  })
  .strict();

const PasoSchema = z
  .object({
    texto: z.string().min(1).max(600),
    segundos: z.number().int().min(1).max(600)
  })
  .strict();

export const ManifestationPayloadSchema = z
  .object({
    afirmaciones: z.array(AfirmacionSchema).min(1).max(MAX_AFIRMACIONES),
    visualizacion: z
      .object({
        titulo: z.string().max(200),
        pasos: z.array(PasoSchema).min(1).max(MAX_PASOS)
      })
      .strict(),
    recordatorio: z.string().min(1).max(1000),
    pregunta: z.string().min(1).max(1000),
    cita: z
      .object({
        texto: z.string().max(600),
        // El principio SÍ es un enum cerrado: es lo que se enseña en el pie de
        // la cita, y un valor desconocido dejaría ahí una etiqueta vacía.
        principio: z.enum(PRINCIPIOS)
      })
      .strict(),
    mantra: z.string().max(400).optional(),
    accionDelDia: z
      .object({
        texto: z.string().min(1).max(400),
        rasgoId: z.string().max(64).optional(),
        area: z.enum(AREAS).optional()
      })
      .strict()
      .optional(),
    focusArea: z.string().max(40).optional(),
    factIds: z.array(z.string().max(120)).max(120)
  })
  .strict();

export type ManifestationPayload = z.infer<typeof ManifestationPayloadSchema>;

/** El sobre completo que devuelve `POST /manifestation/daily`. */
export const AgentResponseSchema = z
  .object({
    ok: z.literal(true),
    model: z.string().max(120),
    agentVersion: z.string().max(40),
    promptVersion: z.number().int().min(1).max(9999),
    payload: ManifestationPayloadSchema
  })
  .strict();

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

/**
 * Los problemas de forma, en español y en una lista, tal y como se le devuelven
 * al agente en un 422.
 *
 * Que sean legibles no es cortesía: el agente sabe reintentar con las
 * correcciones escritas —igual que hace el respaldo con los problemas del
 * saneado—, y un `ZodError` en crudo no le dice qué reescribir.
 */
export function problemasDeForma(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((i) => {
    const donde = i.path.length ? i.path.join(".") : "la respuesta";
    return `${donde}: ${i.message}`;
  });
}

/** Las categorías y áreas que el agente puede usar, para mandárselas en el contexto. */
export const VOCABULARIO = { categorias: [...CATEGORIAS], areas: [...AREAS], principios: [...PRINCIPIOS] } as const;
