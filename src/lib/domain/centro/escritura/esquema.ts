// Cómo sabe el modelo qué puede escribir sin que el prompt cargue 49 esquemas
// (D-203). Puro, probado en tests/domain/centro-escritura-esquema.test.ts.
//
// El prompt lleva un ÍNDICE corto (tabla + para qué + operaciones). Los campos
// se piden con la herramienta `esquema_de_tabla` justo antes de proponer. Los
// dos salen del registro: no pueden desincronizarse.

import type { Domain } from "../../insights/types.ts";
import type { CajaDeHerramientas, FunctionDeclaration } from "../../ai/tools.ts";
import { ESCRITURA_POR_TABLA, entradaDe, type EntradaDeEscritura } from "./registro.ts";

const NO_DISPONIBLE = { error: "Esa tabla no está disponible." };

export function esquemaParaModelo(tabla: string, autorizados: readonly Domain[]): unknown {
  const e = entradaDe(tabla, autorizados);
  if (!e) return NO_DISPONIBLE;
  return {
    tabla: e.tabla,
    operaciones: [...e.operaciones],
    campos: Object.entries(e.campos).map(([nombre, c]) => ({
      nombre,
      etiqueta: c.etiqueta,
      tipo: c.tipo,
      obligatorioAlCrear: Boolean(c.obligatorio) && !c.soloEditar,
      soloAlCrear: Boolean(c.soloCrear),
      soloAlEditar: Boolean(c.soloEditar),
      ...(c.opciones ? { opciones: [...c.opciones] } : {}),
      ...(c.min !== undefined ? { min: c.min } : {}),
      ...(c.max !== undefined ? { max: c.max } : {}),
      ...(c.refTabla ? { refTabla: c.refTabla, nota: `"fila:${c.refTabla}:<uuid>" de una fila que leíste` } : {})
    })),
    nota: "Para editar o borrar, lee primero la fila (buscar o consultar) y usa su id. Al editar manda solo los campos que cambian."
  };
}

export function indiceDeEscritura(): string {
  return Object.entries(ESCRITURA_POR_TABLA as Record<string, EntradaDeEscritura>)
    .map(([t, e]) => `- ${t} (${e.etiqueta}): ${e.descripcion}. [${e.operaciones.join("/")}]`)
    .join("\n");
}

const DECLARACION: FunctionDeclaration = {
  name: "esquema_de_tabla",
  description:
    "Devuelve los campos que puedes escribir en una tabla (tipo, obligatorios, valores permitidos) y qué operaciones admite. Llámala SIEMPRE antes de proponer un cambio en esa tabla.",
  parameters: {
    type: "OBJECT",
    properties: {
      tabla: { type: "STRING", description: "La tabla.", enum: Object.keys(ESCRITURA_POR_TABLA), format: "enum" }
    },
    required: ["tabla"],
    propertyOrdering: ["tabla"]
  }
};

/** La caja del Centro: la de siempre más `esquema_de_tabla`. El resto se delega tal cual. */
export function conEscritura(caja: CajaDeHerramientas, autorizados: readonly Domain[]): CajaDeHerramientas {
  return {
    ...caja,
    declaraciones: [...caja.declaraciones, DECLARACION],
    async ejecutar(name, args) {
      if (name === DECLARACION.name) return esquemaParaModelo(String(args.tabla ?? ""), autorizados);
      return caja.ejecutar(name, args);
    }
  };
}
