// src/lib/domain/agents/types.ts
// El vocabulario de los agentes (D-170) — lógica pura, sin React ni Supabase.
//
// POR QUÉ EXISTE
// LifeOS ya tiene piezas que piensan: el Coach propone, Manifestation redacta,
// Insights resume, Automations despacha, el chat llama herramientas. Ninguna
// sabe de las otras. Cada una se invoca desde su propio sitio con su propia
// firma, y por eso «conectar dos» siempre ha significado escribir el pegamento
// a mano una vez más.
//
// Lo que falta no es inteligencia: es un NOMBRE COMÚN. Este archivo lo da, y
// nada más. Aquí no se ejecuta nada, no se elige nada y no se orquesta nada;
// eso llega en sprints posteriores. Un sprint que sólo define palabras parece
// poco trabajo hasta que se mira el coste de la alternativa: cada módulo que
// llega inventando su propio contrato deja una costura permanente.
//
// Sin "server-only" a propósito: igual que `domain/ritual/types.ts`, esto lo
// importan el servidor, los componentes cliente y los tests. El día que un
// agente deba describirse en pantalla, el tipo ya está del lado correcto.

/**
 * El identificador estable de un agente.
 *
 * Es un `string` y no un enum porque los agentes se registran, no se declaran
 * en un sitio central: un enum obligaría a editar este archivo para añadir
 * cada agente nuevo, que es justo el acoplamiento del que se huye.
 *
 * El formato lo impone `validarAgente()` en contrato.ts: minúsculas, dígitos y
 * guiones. Se escribe como alias para que las firmas digan `AgentId` y no
 * `string`, y quien lea `obtener(id: AgentId)` sepa que ese string tiene reglas.
 */
export type AgentId = string;

/**
 * Lo que un agente recibe para trabajar.
 *
 * Hoy sólo el usuario, y esa pobreza es deliberada. Contexto, memoria, grafo,
 * evento disparador y presupuesto de tokens van a entrar aquí, pero inventarlos
 * ahora —sin un solo agente real que los consuma— sería adivinar la forma de
 * algo que todavía no se ha usado nunca. Ampliar este tipo cuando llegue el
 * primer agente cuesta una línea; desandar cinco campos mal elegidos que ya
 * tienen implementaciones encima, no.
 */
export interface AgentInput {
  userId: string;
}

/**
 * Lo que un agente devuelve.
 *
 * Unión discriminada, no `{ ok, datos?, reason? }`, para que el compilador
 * obligue a mirar `ok` antes de tocar `datos`. Es la misma forma que ya usan
 * `Guardia` (lib/identity/agent-auth.ts) y `generar.ts`.
 *
 * Y `reason` es texto pintable, no un código: D-021 dice que todo lo que rodea
 * al modelo NO lanza, devuelve un motivo que la pantalla puede mostrar tal cual.
 * Un agente que lanza se lleva por delante lo que lo invocó.
 */
export type AgentResult<T = unknown> =
  | { ok: true; datos: T }
  | { ok: false; reason: string };

/**
 * Lo que hay que escribir para que algo sea un agente de LifeOS.
 *
 * `ejecutar` está aquí —en el TIPO— aunque el runtime de este sprint no lo
 * llame nunca. Es la diferencia entre «preparado para ejecutar» y «un método
 * vacío esperando»: el contrato queda cerrado y verificado por el compilador,
 * de modo que el Sprint 2 añade la invocación sin renegociar nada con los
 * agentes que ya se hayan escrito.
 */
export interface AgentDefinition<S = unknown> {
  id: AgentId;
  /**
   * Versión del agente, no del contrato. Sirve para que una corrida guardada
   * diga qué versión la produjo: sin esto, un agente que cambia de criterio
   * deja un historial donde resultados incomparables parecen comparables.
   */
  version: string;
  /** Para qué sirve, en una frase y en el idioma del usuario. */
  descripcion: string;
  ejecutar(entrada: AgentInput): Promise<AgentResult<S>>;
}

/**
 * Un agente cualquiera, para cuando sólo hace falta guardarlo o listarlo.
 *
 * No lleva `any`: `ejecutar` se declara con sintaxis de método, que TypeScript
 * comprueba de forma bivariante, así que un `AgentDefinition<MiSalida>` encaja
 * aquí sin forzar nada. La entrada NO es genérica a propósito —si cada agente
 * pudiera pedir la suya, no habría contrato común que registrar.
 */
export type AnyAgentDefinition = AgentDefinition<unknown>;
