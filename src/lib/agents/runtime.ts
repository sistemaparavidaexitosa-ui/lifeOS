import "server-only";

// src/lib/agents/runtime.ts
// El punto de entrada del núcleo agentic (D-170).
//
// POR QUÉ EXISTE
// Es la raíz de composición: el único sitio del proceso donde se sabe QUÉ
// agentes existen. El dominio (domain/agents/) sabe qué es un agente y cómo
// guardarlo; este archivo decide cuáles hay. Separarlo no es ceremonia, es lo
// mismo que ya hacen `domain/ritual/*` frente a `lib/ritual/*` y
// `domain/automations/rules.ts` frente a `lib/automations/dispatch.ts`.
//
// Lleva "server-only" aunque hoy no toque nada del servidor. Es una promesa
// hacia adelante: en cuanto se registre el primer agente real leerá Supabase y
// llamará al modelo, y quiero que el error por importarlo desde un componente
// cliente llegue AHORA —cuando la importación está de más— y no dentro de tres
// sprints, cuando además arrastre credenciales al bundle.
//
// NO EXPONE `ejecutar()`, Y ESO ES EL SPRINT
// El contrato de ejecución ya está cerrado en `AgentDefinition.ejecutar`, así
// que los agentes se pueden escribir enteros desde hoy. Lo que falta es quién
// los llama, con qué presupuesto, qué se guarda de cada corrida y qué pasa
// cuando uno tarda demasiado. Esas son cuatro decisiones que no se toman bien
// en abstracto, sin un solo agente real delante. Un `ejecutar()` escrito ahora
// sería una respuesta inventada a preguntas que todavía no se han hecho.
//
// Hoy este registro está VACÍO a propósito: el sistema se comporta exactamente
// igual que antes de que existiera este archivo.

import { crearRegistro } from "@/lib/domain/agents/registro.ts";
import type { AgentId, AnyAgentDefinition } from "@/lib/domain/agents/types.ts";
import type { ActionResult } from "@/lib/supabase/errors";

/**
 * El registro compartido del proceso.
 *
 * Un módulo de ESM se evalúa una vez por proceso, así que esto es el singleton
 * sin necesidad de inventar uno. No se exporta: si cualquiera pudiera alcanzar
 * el `Map`, la validación de contrato.ts sería opcional y dejaría de servir.
 */
const registro = crearRegistro();

/**
 * Da de alta un agente. No lanza: devuelve `{ ok: false, reason }` con un
 * motivo legible si la definición no cumple el contrato o el id ya está usado.
 *
 * Quien llame decide qué hacer con el fallo. Lo normal, al arrancar, es
 * registrarlo y seguir: un agente que no entra es una capacidad de menos, no
 * una aplicación rota.
 */
export function registrarAgente(def: AnyAgentDefinition): ActionResult {
  return registro.registrar(def);
}

/** El agente con ese id, o `null` si no hay ninguno. */
export function obtenerAgente(id: AgentId): AnyAgentDefinition | null {
  return registro.obtener(id);
}

/** Los agentes registrados, ordenados por id. Hoy: ninguno. */
export function listarAgentes(): AnyAgentDefinition[] {
  return registro.listar();
}
