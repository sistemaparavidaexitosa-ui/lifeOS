// src/lib/domain/agents/types.ts
// El vocabulario de los agentes (D-170, extendido en D-171) — lógica pura, sin
// React ni Supabase.
//
// POR QUÉ EXISTE
// LifeOS ya tiene piezas que piensan: el Coach propone, Manifestation redacta,
// Insights resume, Automations despacha, el chat llama herramientas. Ninguna
// sabe de las otras. Cada una se invoca desde su propio sitio con su propia
// firma, y por eso «conectar dos» siempre ha significado escribir el pegamento
// a mano una vez más. Lo que falta no es inteligencia: es un NOMBRE COMÚN.
//
// Sin "server-only" a propósito: igual que `domain/ritual/types.ts`, esto lo
// importan el servidor, los componentes cliente y los tests.
//
// LA REGLA QUE ORDENA ESTE ARCHIVO
// El Kernel decide QUIÉN actúa y SI conviene actuar. No sabe hacer nada. Todo
// lo que sabe hacer algo ya existe, así que este vocabulario se apoya en el que
// ya hay —`Domain` de Insights, `Area` de identidad, `Budget` del dominio de
// IA— en vez de inventar sinónimos. Cada import de este archivo es una
// duplicación que no se escribió.

import type { Domain } from "../insights/types.ts";
import type { Fact } from "../insights/types.ts";
import type { Area } from "../identity/categorias.ts";
import type { Budget } from "../ai/model-chain.ts";
import type { CajaDeHerramientas } from "../ai/tools.ts";

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
 * Qué hace que un agente despierte. Unión cerrada, como `TriggerType` de
 * `domain/automations/rules.ts`: el compilador obliga a cubrir cada caso, y un
 * disparo que nadie sabe emitir no se puede declarar por error.
 *
 * `identidad.revisada` NO es aspiracional: el trigger
 * `registrar_revision_de_identidad` (migración 0064) ya escribe
 * `identity_revisions` en cada cambio del perfil. Lo único que falta es que
 * alguien lo convierta en este evento. Está aquí porque es el disparo que
 * invalida lo aprendido: sin él, el sistema sabotearía en junio a quien cambió
 * de rumbo en enero.
 */
export const DISPAROS = [
  "cron.manana",
  "cron.noche",
  "habito.completado",
  "tarea.cambio_estado",
  "identidad.revisada",
  "centro.abierto"
] as const;

export type AgentTrigger = (typeof DISPAROS)[number];

export function esDisparo(v: string): v is AgentTrigger {
  return (DISPAROS as readonly string[]).includes(v);
}

/**
 * Qué puede hacer un agente. La lista es corta a propósito: **no existe
 * «escribir»**.
 *
 * La salida de un agente es una propuesta en `coach_proposals`; quien escribe
 * es una Server Action con la sesión de la persona y la RLS de siempre (D-089,
 * D-164). Añadir aquí una capacidad de escritura sería la primera grieta en la
 * invariante que hace que un fallo del Kernel sea un silencio y no un daño.
 */
export const CAPACIDADES = ["proponer", "resumir", "detectar"] as const;
export type AgentCapability = (typeof CAPACIDADES)[number];

/**
 * Cuánto puede actuar por su cuenta.
 *
 * Hoy **solo `propone` es legal**; los otros dos existen para poder nombrarlos
 * y rechazarlos en `validarAgente()` en vez de que alguien los invente con otro
 * nombre dentro de seis meses. Que el vocabulario admita lo que la política
 * prohíbe es deliberado: así el rechazo está escrito en un sitio y se puede
 * probar.
 */
export const AUTONOMIAS = ["propone", "actua_con_permiso", "autonomo"] as const;
export type AgentAutonomy = (typeof AUTONOMIAS)[number];

/** Cuánto duele si se equivoca. Lo usa `politicas.ts`, no el registro. */
export const RIESGOS = ["bajo", "medio", "alto"] as const;
export type AgentRisk = (typeof RIESGOS)[number];

/**
 * Algo que pasó y que puede despertar a un agente.
 *
 * **No se persiste.** Vive dentro de una petición, exactamente como
 * `AutomationEvent` desde la migración 0008. Una tabla de eventos genérica
 * parece la base de todo sistema agentic y aquí sería una tabla enorme sin
 * lector: los disparos ya existen (Server Actions, `pg_cron`) y lo que merece
 * guardarse ya se guarda (`audit_log`, `coach_proposals`, `centro_runs`).
 */
export interface AgentEvent {
  tipo: AgentTrigger;
  userId: string;
  /** ISO. Cuándo pasó, no cuándo se procesó. */
  ocurridoEn: string;
  /** Qué filas lo provocaron. Misma forma que `Fact.refs`. */
  refs?: { table: string; id: string }[];
}

/**
 * Lo que un agente recibe para trabajar.
 *
 * NO lleva el `InsightContext` de `lib/insights/context.ts`, aunque el diseño
 * lo proponía. Dos razones: importarlo invertiría las capas —el dominio
 * dependería de la capa de aplicación, que aquí no lo hace nadie— y ataría el
 * contrato de TODO agente al vocabulario del Intelligence OS. Lo que el agente
 * necesita son los datos, no el envase: `domains` y `facts` ya viven en el
 * dominio, y `memory`/`rejections` son texto plano.
 *
 * La conversión `InsightContext → AgentInput` es trivial y vivirá en la capa de
 * efectos cuando haya un llamador real (Fase 3).
 */
export interface AgentInput {
  userId: string;
  /** YYYY-MM-DD en la zona de la persona. Nunca `new Date()` dentro del agente. */
  today: string;
  timeZone: string;
  evento: AgentEvent;
  /** Los que de verdad viajan: `ai_domains` ∩ `agente.domains`. */
  domains: Domain[];
  /**
   * Los que este agente pidió y NO puede ver, porque la persona los tiene
   * apagados para la IA.
   *
   * Añadido en D-172, al envolver el primer agente real: el prompt del coach ya
   * decía «el usuario apagó estos dominios, no especules sobre ellos», y sin
   * este campo el agente habría redactado como si tuviera la foto completa. Es
   * lo contrario de un dato de depuración: es lo que impide que el silencio de
   * la persona se lea como ausencia de problema.
   */
  skippedDomains: Domain[];
  /** Ya filtrados, ordenados por peso y recortados. El agente no calcula. */
  facts: Fact[];
  /** Memoria vigente, ya resuelta por `activeMemory()`. */
  memory: string[];
  /** Lo que la persona ya rechazó. Solo el rechazo enseña, de momento. */
  rejections: string[];
  /**
   * Con qué puede pedir más datos a mitad de razonar, si quien lo llama se la
   * dio (D-173).
   *
   * Opcional, y esa opcionalidad es el contrato: un agente tiene que saber
   * trabajar sin herramientas, porque quien lo invoca puede no poder
   * construirlas —el despachador nocturno corre sin sesión y le quita
   * `consultar` por eso mismo—. Un agente que sin caja no sabe qué hacer está
   * mal escrito.
   *
   * La FORMA vive en el dominio (`domain/ai/tools.ts`); la FÁBRICA, que toca
   * Supabase, sigue en `lib/ai/tools.ts` con su `server-only`. Por eso esto
   * cabe aquí sin que el dominio dependa de la capa que habla con la base.
   */
  herramientas?: CajaDeHerramientas;
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
 * `ejecutar` está aquí —en el TIPO— desde D-170, y el runtime no lo llamó hasta
 * D-171. Es la diferencia entre «preparado para ejecutar» y «un método vacío
 * esperando»: el contrato queda cerrado y verificado por el compilador.
 */
export interface AgentDefinition<S = unknown> {
  id: AgentId;
  /** Cómo se llama para una persona. `id` es para máquinas. */
  name: string;
  /**
   * Versión del agente, no del contrato. Sirve para que una corrida guardada
   * diga qué versión la produjo: sin esto, un agente que cambia de criterio
   * deja un historial donde resultados incomparables parecen comparables.
   */
  version: string;
  /** Para qué sirve, en una frase y en el idioma del usuario. */
  descripcion: string;

  /**
   * Los dominios que necesita ver.
   *
   * Es el campo más importante del contrato: ata cada agente a la puerta de
   * privacidad que ya existe (D-027). Se INTERSECA con `profiles.ai_domains`, y
   * si la intersección queda vacía el agente no corre —antes de tocar ninguna
   * tabla de ese dominio—. Que sea obligatorio significa que no se puede
   * escribir un agente que vea todo por descuido.
   */
  domains: Domain[];

  /**
   * A qué versión de la persona sirve este agente.
   *
   * Son las SIETE `AREAS` de la migración 0064, no texto libre, y esa es toda
   * la decisión: con áreas cerradas, `identidadesIncompatibles()` puede
   * DETECTAR un conflicto y probarlo con un test. Con texto libre solo se
   * podría preguntar al modelo, y una respuesta que no se puede verificar no es
   * una salvaguarda, es una opinión.
   */
  identityServed: Area[];

  triggers: AgentTrigger[];
  capabilities: AgentCapability[];
  riskLevel: AgentRisk;
  autonomyLevel: AgentAutonomy;

  /** Apagarlo no lo borra del registro: sigue listable y explicable. */
  enabled: boolean;
  /** Menor corre antes. Empate: por `id`, para que el orden sea estable. */
  priority: number;

  /**
   * Obligatorio. No se llama al modelo sin declarar cuánto puede gastar, y el
   * sitio de esa promesa es el contrato, no el cuerpo de `ejecutar`.
   */
  budget: Budget;

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
