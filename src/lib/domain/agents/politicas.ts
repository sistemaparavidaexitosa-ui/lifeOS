// src/lib/domain/agents/politicas.ts
// ¿Conviene actuar? (D-171) — lógica pura, probada en
// tests/domain/agents-politicas.test.ts.
//
// POR QUÉ EXISTE
// Éste es el archivo que decide si LifeOS es respetuoso o insistente, y es el
// único del Kernel que no existiría en un sistema agentic normal.
//
// El propósito del producto es reducir la distancia entre quien la persona es y
// quien quiere ser. De ahí se sigue algo incómodo: **la mayoría de las veces
// que el sistema PUEDE decir algo, no DEBE**. Una propuesta que no acumula
// evidencia de identidad solo llena un hueco de actividad, y un sistema que
// llena huecos acaba siendo una app de culpa que se abre con ansiedad.
//
// Por eso el veredicto por defecto es NO. Hay que argumentar para actuar, no
// para callar.
//
// PRECEDENTES QUE YA HACEN ESTO
// No es un concepto importado de fuera: `debeAnalizar()` no llama al modelo si
// los hechos no cambiaron, `MAX_ARISTAS_POR_DIA = 3` acota las sugerencias del
// grafo, `centro_runs` permite una generación por franja y el centro tiene tope
// de seis tarjetas (D-169). Esto generaliza esa disciplina y le pone nombre.

import type { AgentEvent, AgentRisk, AnyAgentDefinition } from "./types.ts";

export type Veredicto = { actuar: true } | { actuar: false; motivo: string };

const NO = (motivo: string): Veredicto => ({ actuar: false, motivo });
const SI: Veredicto = { actuar: true };

/**
 * Lo que ya pasó hoy, para no repetirse.
 *
 * Es lo mínimo: cuántas veces actuó este agente en la franja y qué se propuso
 * ya. No lee la base —es puro—; se lo pasa quien lo llame, igual que
 * `decide()` recibe las automatizaciones en vez de consultarlas.
 */
export interface HistoriaReciente {
  /** Cuántas veces actuó ESTE agente en la franja actual. */
  vecesEnLaFranja: number;
  /** Ids de agentes que ya actuaron en esta franja, en orden. */
  yaActuaron: readonly string[];
  /** Si la persona ya descartó hoy una propuesta de este agente. */
  descartadoHoy: boolean;
  /**
   * Si este agente lleva semanas proponiendo cosas que nadie acepta (D-174).
   *
   * Lo calcula `enRechazoSostenido()` con los datos de `coach_proposals`, y es
   * la única lección que cambia la conducta del Kernel en vez de solo el
   * prompt. Opcional porque quien llama puede no tener el historial a mano: sin
   * él se actúa como siempre, que es el defecto correcto —callar por falta de
   * datos sería castigar a un agente por ser nuevo.
   */
  rechazoSostenido?: boolean;
}

/**
 * El tope por franja, por riesgo.
 *
 * Un agente de riesgo alto interrumpe menos, no más: si equivocarse duele, el
 * precio de insistir es mayor. Es lo contrario de lo que haría un sistema
 * optimizado para engagement, y por eso está escrito aquí y no configurado.
 */
const TOPE_POR_FRANJA: Record<AgentRisk, number> = {
  bajo: 2,
  medio: 1,
  alto: 1
};

/**
 * ¿Conviene que este agente actúe ahora?
 *
 * El orden de las comprobaciones importa: primero lo que apaga al agente
 * entero, luego lo que depende de la persona, y al final lo caro de explicar.
 * Así el motivo que sale es siempre el más cercano a la causa.
 */
export function convieneActuar(
  agente: AnyAgentDefinition,
  evento: AgentEvent,
  historia: HistoriaReciente
): Veredicto {
  if (!agente.enabled) return NO(`«${agente.name}» está apagado.`);

  if (!agente.triggers.includes(evento.tipo)) {
    return NO(`«${agente.name}» no responde a ${evento.tipo}.`);
  }

  // Un descarte de hoy no es ruido estadístico: es la persona diciendo que no.
  // Volver a proponer el mismo día es exactamente cómo un sistema útil se
  // convierte en uno del que hay que esconderse.
  if (historia.descartadoHoy) {
    return NO(`Hoy ya descartaste una propuesta de «${agente.name}».`);
  }

  // Un agente al que no se le acepta nada no está ayudando, por buenas que
  // sean sus frases. Va DESPUÉS del descarte del día —que es más reciente y más
  // concreto— y ANTES del tope, porque este silencio no es por haber hablado ya:
  // es por no merecer el turno.
  //
  // Se cae solo: silenciado el agente, deja de haber decisiones suyas, y en
  // cuanto envejecen bajo `minDias` vuelve a hablar. Ver aprendizaje.ts.
  if (historia.rechazoSostenido) {
    return NO(`«${agente.name}» lleva semanas proponiendo cosas que descartas; se calla hasta que haya datos nuevos.`);
  }

  const tope = TOPE_POR_FRANJA[agente.riskLevel];
  if (historia.vecesEnLaFranja >= tope) {
    return NO(`«${agente.name}» ya habló ${historia.vecesEnLaFranja} ${historia.vecesEnLaFranja === 1 ? "vez" : "veces"} en esta franja.`);
  }

  if (!generaEvidencia(agente, evento)) {
    return NO(`«${agente.name}» generaría actividad, no evidencia de identidad.`);
  }

  return SI;
}

/**
 * ¿Lo que este agente va a hacer acumula evidencia de identidad, o solo llena
 * un hueco?
 *
 * DETERMINISTA, y ésta es la decisión de diseño más discutible del Kernel.
 * Podría juzgarlo el modelo y acertaría más matices; pero entonces el sistema
 * no podría explicar por qué interrumpió, y un restraint que no se puede
 * auditar no protege a nadie: se convierte en un adorno que siempre dice que sí.
 *
 * La regla: hay evidencia si el agente sirve a un área concreta de la identidad
 * Y puede proponer o detectar algo. `resumir` no genera evidencia por sí solo
 * —un resumen es información, no un paso—, salvo que lo pida la persona
 * abriendo el centro.
 *
 * Deliberadamente conservadora. Empezar callado es reversible; empezar
 * insistente quema la confianza y eso no se recupera con un despliegue.
 */
export function generaEvidencia(agente: AnyAgentDefinition, evento: AgentEvent): boolean {
  if (agente.identityServed.length === 0) return false;

  // Lo que la persona pide explícitamente no necesita justificarse: abrir el
  // centro ES la petición.
  if (evento.tipo === "centro.abierto") return true;

  // Una revisión de identidad invalida lo aprendido y merece respuesta aunque
  // solo sea un resumen: es el momento en que el sistema debe dejar de empujar
  // hacia la versión de enero de alguien que cambió en junio.
  if (evento.tipo === "identidad.revisada") return true;

  return agente.capabilities.some((c) => c === "proponer" || c === "detectar");
}

/**
 * Dos agentes que tiran de la persona en direcciones que se estorban.
 *
 * La definición operativa —y es MÍA, no venía en el encargo—: son incompatibles
 * cuando **sirven a áreas completamente distintas y ambos quieren proponer en
 * el mismo momento**. No es que una identidad sea peor que otra; es que
 * recibir a la vez «entrena más» y «descansa más» no ayuda a elegir: paraliza.
 *
 * Que `identityServed` sean las siete `AREAS` cerradas y no texto libre es
 * justo lo que hace esto comprobable. Con texto libre habría que preguntarle al
 * modelo, y una salvaguarda que no se puede probar no es una salvaguarda.
 *
 * Solapar aunque sea en un área basta para NO ser incompatibles: significa que
 * hay un terreno común donde las dos propuestas se leen juntas.
 */
export function identidadesIncompatibles(
  a: AnyAgentDefinition,
  b: AnyAgentDefinition
): boolean {
  if (a.id === b.id) return false;

  const proponen =
    a.capabilities.includes("proponer") && b.capabilities.includes("proponer");
  if (!proponen) return false;

  const areasDeA = new Set<string>(a.identityServed);
  return !b.identityServed.some((area) => areasDeA.has(area));
}

/**
 * De los que podrían actuar, los que de verdad actúan.
 *
 * Aplica `convieneActuar` en orden y, además, deja fuera a quien sirva una
 * identidad incompatible con alguien que ya entró. **Gana el primero**, que por
 * el orden de `seleccion.ts` es el de mayor prioridad: la alternativa —dejar
 * pasar a los dos— es precisamente la contradicción que paraliza.
 *
 * Devuelve también los descartes CON SU MOTIVO. El silencio tiene que poder
 * explicarse, o es indistinguible de un fallo.
 */
export function quienesActuan(
  candidatos: readonly AnyAgentDefinition[],
  evento: AgentEvent,
  historia: HistoriaReciente
): { actuan: AnyAgentDefinition[]; callan: { agente: AnyAgentDefinition; motivo: string }[] } {
  const actuan: AnyAgentDefinition[] = [];
  const callan: { agente: AnyAgentDefinition; motivo: string }[] = [];

  for (const agente of candidatos) {
    const veredicto = convieneActuar(agente, evento, historia);
    if (!veredicto.actuar) {
      callan.push({ agente, motivo: veredicto.motivo });
      continue;
    }

    const choca = actuan.find((ya) => identidadesIncompatibles(ya, agente));
    if (choca) {
      callan.push({
        agente,
        motivo: `«${agente.name}» sirve una identidad que hoy se estorba con «${choca.name}».`
      });
      continue;
    }

    actuan.push(agente);
  }

  return { actuan, callan };
}
