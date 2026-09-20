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
// EJECUTAR, DESDE D-171
// D-170 dejó el contrato cerrado en `AgentDefinition.ejecutar` sin que nadie lo
// llamara, porque quién llama y qué se guarda de cada corrida eran preguntas
// que no se responden bien sin un agente real delante. Ahora se responde la
// primera y SOLO la primera: `ejecutarAgente` invoca y traduce fallos. No mide,
// no reintenta, no guarda. La persistencia de corridas llega en la Fase 4, con
// su migración, cuando se sepa qué merece guardarse.
//
// EL REGISTRO YA NO ESTÁ VACÍO, DESDE D-172
// Vive en él el coach diario, y **sigue sin cambiar nada**: nadie llama a
// `ejecutarAgente`, así que el coach de verdad sigue siendo el de
// `/api/push/dispatch` → `generarYGuardarMensajeDiario`. Registrar no es
// conectar. Lo que se gana es que el contrato ya tiene un consumidor real que
// lo pone a prueba en cada `pnpm typecheck`, en vez de un agente de mentira.

import { crearRegistro } from "@/lib/domain/agents/registro.ts";
import { coachDiario } from "./coach-diario.ts";
import type { AgentId, AgentInput, AgentResult, AnyAgentDefinition } from "@/lib/domain/agents/types.ts";
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
 * El alta de los agentes del sistema.
 *
 * Se hace aquí, al evaluarse el módulo, y NO se comprueba el resultado con un
 * `throw`: si el coach no entrara —contrato roto tras un cambio de tipos—, lo
 * correcto es que LifeOS arranque sin coach y lo diga, no que la aplicación
 * entera deje de responder. Es la misma regla que aplica el registro al no
 * lanzar (D-021), sostenida en el único sitio donde sería tentador romperla.
 *
 * El motivo no se pierde: `listarAgentes()` no lo incluirá y `ejecutarAgente`
 * dirá «no hay ningún agente ...». Cuando exista el segundo agente, esto pasa a
 * ser un bucle sobre una lista.
 */
const altaDelCoach = registro.registrar(coachDiario);

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

/** Los agentes registrados, ordenados por id. */
export function listarAgentes(): AnyAgentDefinition[] {
  return registro.listar();
}

/**
 * Qué agentes del sistema no consiguieron entrar, y por qué.
 *
 * Existe para que un alta fallida sea VISIBLE sin tener que tumbar el arranque.
 * Hoy la lista está vacía y lo comprueba el typecheck; el día que no lo esté,
 * esto es lo que hay que mirar antes que el registro.
 */
export function problemasDeArranque(): string[] {
  return altaDelCoach.ok ? [] : [altaDelCoach.reason ?? "El coach diario no se pudo registrar."];
}

/**
 * Ejecuta un agente y devuelve lo que diga, sin interpretarlo.
 *
 * **No lanza, pase lo que pase** (D-021). Un agente es código de otro módulo:
 * puede tener un fallo, quedarse sin red o tirar una excepción donde el
 * contrato pedía un `AgentResult`. Si eso se propagara, un agente secundario
 * roto tumbaría la Server Action que lo invocó —y con ella la pantalla de la
 * persona— por una sugerencia que sobraba. El `try/catch` de aquí es la
 * frontera que convierte «se rompió» en «hoy no dijo nada», que es la forma
 * correcta de fallar para todo lo que rodea al modelo.
 *
 * Lo que este runtime NO hace todavía, y conviene saberlo: no comprueba
 * políticas (eso es `politicas.ts`, y lo aplica quien construye la entrada), no
 * acota el contexto (`contexto.ts`), no mide, no reintenta y no guarda la
 * corrida. Ejecutar es una cosa sola.
 */
export async function ejecutarAgente(
  id: AgentId,
  entrada: AgentInput
): Promise<AgentResult<unknown>> {
  const agente = registro.obtener(id);
  if (!agente) return { ok: false, reason: `No hay ningún agente «${id}».` };

  // Apagado se comprueba aquí ADEMÁS de en la selección: `ejecutarAgente` es
  // público y alguien puede llamarlo por id sin haber pasado por `agentesPara`.
  if (!agente.enabled) return { ok: false, reason: `«${agente.name}» está apagado.` };

  try {
    const resultado = await agente.ejecutar(entrada);
    // Un agente que devuelve algo que no es un AgentResult es un fallo de
    // contrato, no un fallo de ejecución. Se nombra en vez de dejar que el
    // llamador lea `undefined.ok` tres capas más arriba.
    if (typeof resultado !== "object" || resultado === null || typeof resultado.ok !== "boolean") {
      return { ok: false, reason: `«${agente.name}» devolvió algo que no es un resultado de agente.` };
    }
    return resultado;
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `«${agente.name}» falló: ${detalle}` };
  }
}
