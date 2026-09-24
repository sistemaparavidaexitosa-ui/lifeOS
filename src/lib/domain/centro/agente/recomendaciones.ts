// src/lib/domain/centro/agente/recomendaciones.ts
// De lo que propuso el modelo a lo que se puede guardar en `coach_proposals`
// (D-194). Puro, probado en tests/domain/centro-agente-recomendaciones.test.ts.
//
// TRES PUERTAS, EN ESTE ORDEN:
//  1. Sin cifras en el "titulo" ni en el "motivo" de fuera — lo primero que
//     ve la persona.
//  2. La forma que exige `sanearPropuesta` (coach/proposals.ts): el tipo, el
//     título, y —según el tipo— las horas de un bloque o el destino de un
//     foco.
//  3. Un «foco» tiene que llevar a un sitio REAL de la app —mismo
//     `destinoValido` que usan «ir_a» y el validador del runtime— y el
//     "motivo" que trae DENTRO de "datos" —un campo que el paso 1 no vio,
//     porque viaja en el JSON y no en el "motivo" de fuera— se vuelve a
//     comprobar sin cifras antes de guardarse como lo que la persona lee.
import { sanearPropuesta, type PropuestaSaneada } from "../../coach/proposals.ts";
import { destinoValido } from "../sugerencias.ts";
import { tieneCifras } from "./texto.ts";

export interface RecomendacionCruda {
  tipo: string;
  titulo: string;
  motivo: string;
  datos: string;
}

export function sanearRecomendacion(it: RecomendacionCruda, proyectos: { id: string }[]): PropuestaSaneada | null {
  if (tieneCifras(it.titulo) || tieneCifras(it.motivo)) return null;

  const limpia = sanearPropuesta({ tipo: it.tipo, titulo: it.titulo, detalle: it.motivo, datos: it.datos });
  if (!limpia) return null;

  if (limpia.tipo === "foco") {
    if (!destinoValido(limpia.payload.href ?? "", proyectos)) return null;
    if (tieneCifras(limpia.payload.motivo ?? "")) return null;
  }

  return limpia;
}
