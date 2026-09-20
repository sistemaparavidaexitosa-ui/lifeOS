// src/lib/domain/agents/contrato.ts
// ¿Esto que me dan es un agente? (D-170, ampliado en D-171) — lógica pura,
// probada en tests/domain/agents-registro.test.ts.
//
// POR QUÉ EXISTE
// El registro acepta objetos que vienen de otros módulos. Sin una puerta, el
// primer agente mal escrito no falla al registrarse: falla meses después, al
// ejecutarse, lejos del archivo que lo declaró y con un `undefined is not a
// function` que no dice de quién es la culpa.
//
// Misma firma que `validateAction()` de domain/automations/rules.ts —devolver
// el motivo o `null`— y por la misma razón: quien valida no decide qué hacer
// con el fallo. Allí el despachador convierte el motivo en un `skip`; aquí el
// registro lo convierte en `{ ok: false, reason }`. La función sólo sabe leer.
//
// NO se usa zod, y es deliberado: en este repo zod vive en la frontera (rutas,
// Server Actions, salida del modelo), donde el dato es ajeno y puede ser
// cualquier cosa. Un agente no es dato ajeno, es código propio que se comprueba
// al arrancar. Meter un esquema aquí pagaría el peso de un validador de
// frontera para atrapar erratas del programador.

import { DOMAIN_LABEL } from "../insights/types.ts";
import type { Domain } from "../insights/types.ts";
import { AREAS } from "../identity/categorias.ts";
import {
  AUTONOMIAS,
  CAPACIDADES,
  DISPAROS,
  RIESGOS,
  type AnyAgentDefinition
} from "./types.ts";

/**
 * Minúsculas, dígitos y guiones. Sin espacios, sin mayúsculas, sin puntos.
 *
 * El id va a acabar en una tabla, en un log y probablemente en una URL. Fijar
 * la forma ahora —cuando no hay ni un agente registrado— cuesta esta línea;
 * fijarla cuando existan veinte, con datos escritos, cuesta una migración.
 */
const FORMA_DEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Un id larguísimo no rompe nada, pero delata que alguien puso ahí una frase. */
const MAX_ID = 64;

/**
 * La única autonomía que hoy es legal.
 *
 * El vocabulario admite tres (`types.ts`) y la política acepta una. No es una
 * incoherencia: que el tipo pueda nombrar lo que la regla prohíbe es lo que
 * permite RECHAZARLO en un sitio y probar el rechazo, en vez de que alguien
 * invente `autonomyLevel: "libre"` dentro de seis meses porque el suyo no
 * cabía. Se ensancha cuando exista un agente que lo justifique, no antes.
 */
const AUTONOMIA_PERMITIDA = "propone";

const es = <T extends string>(lista: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (lista as readonly string[]).includes(v);

const listaNoVacia = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0;

/**
 * ¿La definición tiene lo que necesita para vivir en el registro? Devuelve el
 * motivo si no, en texto pintable (D-021).
 *
 * Recibe `unknown` y no `AnyAgentDefinition` porque el valor puede venir de un
 * módulo que ni siquiera compila contra estos tipos. Una validación que exige
 * estar ya bien tipada para dejarse llamar no valida nada.
 */
export function validarAgente(candidato: unknown): string | null {
  if (typeof candidato !== "object" || candidato === null) {
    return "Un agente tiene que ser un objeto.";
  }

  const def = candidato as Partial<AnyAgentDefinition>;

  // --- Identidad del agente ---
  if (typeof def.id !== "string" || def.id.length === 0) {
    return "El agente no tiene identificador.";
  }
  if (def.id.length > MAX_ID) {
    return `El identificador «${def.id.slice(0, 20)}…» es demasiado largo: máximo ${MAX_ID} caracteres.`;
  }
  if (!FORMA_DEL_ID.test(def.id)) {
    return `El identificador «${def.id}» no vale: sólo minúsculas, dígitos y guiones (por ejemplo «coach-diario»).`;
  }

  const yo = `El agente «${def.id}»`;

  if (typeof def.name !== "string" || def.name.trim().length === 0) {
    return `${yo} no tiene nombre legible.`;
  }
  if (typeof def.version !== "string" || def.version.length === 0) {
    return `${yo} no dice su versión.`;
  }
  if (typeof def.descripcion !== "string" || def.descripcion.trim().length === 0) {
    return `${yo} no dice para qué sirve.`;
  }

  // --- La puerta de privacidad ---
  // Sin dominios no hay intersección posible con `ai_domains`, y un agente sin
  // intersección no es «un agente que lo ve todo»: es uno que no se puede
  // auditar. Por eso la lista vacía se rechaza en vez de interpretarse.
  if (!listaNoVacia(def.domains)) {
    return `${yo} no declara qué dominios necesita ver. Sin eso no se puede aplicar la puerta de privacidad.`;
  }
  const dominios = Object.keys(DOMAIN_LABEL) as Domain[];
  for (const d of def.domains) {
    if (!es(dominios, d)) return `${yo} pide un dominio que no existe: «${String(d)}».`;
  }

  // --- El Principio de Identidad ---
  if (!listaNoVacia(def.identityServed)) {
    return `${yo} no dice a qué versión de ti sirve. Un agente que no lo sabe sólo puede generar actividad.`;
  }
  for (const a of def.identityServed) {
    if (!es(AREAS, a)) {
      return `${yo} sirve a un área que no existe: «${String(a)}». Son las siete de tu identidad.`;
    }
  }

  // --- Cuándo y cómo actúa ---
  if (!listaNoVacia(def.triggers)) return `${yo} no dice qué lo despierta.`;
  for (const t of def.triggers) {
    if (!es(DISPAROS, t)) return `${yo} espera un disparo que nadie emite: «${String(t)}».`;
  }

  if (!listaNoVacia(def.capabilities)) return `${yo} no dice qué sabe hacer.`;
  for (const c of def.capabilities) {
    if (!es(CAPACIDADES, c)) return `${yo} declara una capacidad que no existe: «${String(c)}».`;
  }

  if (!es(RIESGOS, def.riskLevel)) return `${yo} no dice cuánto duele si se equivoca.`;

  if (!es(AUTONOMIAS, def.autonomyLevel)) return `${yo} no dice cuánta autonomía pide.`;
  if (def.autonomyLevel !== AUTONOMIA_PERMITIDA) {
    return `${yo} pide autonomía «${def.autonomyLevel}», y hoy sólo se permite «${AUTONOMIA_PERMITIDA}»: quien escribe es una Server Action con tu sesión, nunca un agente.`;
  }

  if (typeof def.enabled !== "boolean") return `${yo} no dice si está encendido.`;
  if (!Number.isFinite(def.priority)) return `${yo} no tiene prioridad.`;

  // --- Presupuesto ---
  const b = def.budget;
  if (typeof b !== "object" || b === null) {
    return `${yo} no declara presupuesto. No se llama al modelo sin decir cuánto puede gastar.`;
  }
  if (!Number.isFinite(b.maxOutputTokens) || b.maxOutputTokens <= 0) {
    return `${yo} tiene un tope de salida que no vale.`;
  }
  if (!Number.isFinite(b.thinkingBudget) || b.thinkingBudget < 0) {
    return `${yo} tiene un presupuesto de pensamiento que no vale.`;
  }
  if (b.thinkingBudget >= b.maxOutputTokens) {
    // El peor fallo posible del proveedor: `MAX_TOKENS` con el texto vacío,
    // que no es un error de red y hay que detectar a mano. Se atrapa aquí.
    return `${yo} puede gastar pensando (${b.thinkingBudget}) todo su tope (${b.maxOutputTokens}) y quedarse sin respuesta.`;
  }

  if (typeof def.ejecutar !== "function") return `${yo} no sabe ejecutarse.`;

  return null;
}
