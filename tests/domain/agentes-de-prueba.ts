// tests/domain/agentes-de-prueba.ts
// Fábrica de agentes para las suites del Kernel (D-171).
//
// No es un archivo de test —`test:unit` solo recoge `*.test.ts`—, igual que
// `seed-catalogo.ts`. Existe porque `AgentDefinition` tiene catorce campos
// obligatorios y cuatro suites lo necesitan: repetir el literal en cada una
// significaría que añadir un campo al contrato obliga a tocar cuatro archivos
// de prueba, y que tarde o temprano difieran sin que nadie lo note.

import type { AnyAgentDefinition } from "../../src/lib/domain/agents/types.ts";

/**
 * Un agente válido, con lo mínimo para pasar `validarAgente()`.
 *
 * `extra` va al final para poder romper exactamente un campo por test: es más
 * legible que escribir el objeto entero cada vez, y deja claro en cada caso qué
 * es lo que se está probando.
 */
export function agente(
  id: string,
  extra: Partial<AnyAgentDefinition> = {}
): AnyAgentDefinition {
  return {
    id,
    name: `Agente ${id}`,
    version: "1",
    descripcion: `Agente de prueba ${id}`,
    domains: ["habits"],
    identityServed: ["Salud"],
    triggers: ["cron.manana"],
    capabilities: ["proponer"],
    riskLevel: "bajo",
    autonomyLevel: "propone",
    enabled: true,
    priority: 100,
    budget: { maxOutputTokens: 1000, thinkingBudget: 256 },
    ejecutar: async () => ({ ok: true, datos: id }),
    ...extra
  };
}

/** Un evento cualquiera, para cuando la suite no prueba el evento. */
export function evento(
  tipo: AnyAgentDefinition["triggers"][number] = "cron.manana",
  userId = "u1"
) {
  return { tipo, userId, ocurridoEn: "2026-09-20T06:00:00.000Z" };
}

/** Historial limpio: nadie ha actuado todavía hoy. */
export function historiaLimpia() {
  return { vecesEnLaFranja: 0, yaActuaron: [] as string[], descartadoHoy: false };
}
