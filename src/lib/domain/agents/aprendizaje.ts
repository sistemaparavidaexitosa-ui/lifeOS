// src/lib/domain/agents/aprendizaje.ts
// Qué aprende el Kernel de lo que decidiste (D-174) — lógica pura, probada en
// tests/domain/agents-aprendizaje.test.ts.
//
// POR QUÉ EXISTE, Y QUÉ APRENDE EXACTAMENTE
// Se aprende de la DECISIÓN, no del contenido. No «le gustan los mensajes a las
// nueve», sino «lleva un mes tirando a la basura todo lo que le propone rutinas;
// deja de proponerle rutinas». La diferencia importa: lo primero optimiza
// cuándo interrumpir, que es la métrica de una app que quiere engancharte; lo
// segundo reduce la cantidad de veces que hace falta interrumpir.
//
// EL MÉTODO NO ES NUEVO, Y ESO ES LO BUENO
// `domain/identity/estilo.ts` (D-164) ya hace esto para el estilo del brief, con
// umbrales de significancia y descarte leave-one-out, y lleva meses funcionando.
// Aquí se generaliza a las propuestas. Copiar un método probado vale más que
// inventar uno mejor en el papel.
//
// LAS TRES SALVAGUARDAS SON EL PRODUCTO, NO LA ESTADÍSTICA
// 1. **Corte por revisión de identidad.** Lo decidido ANTES de que la persona
//    cambiara en quién quiere convertirse no cuenta. Sin esto, el sistema
//    sabotearía en junio a quien cambió de rumbo en enero.
// 2. **Contrafactual obligatorio** (`minSinN`). Una lección sobre las rutinas
//    exige que también haya habido decisiones que NO eran de rutinas. Si el
//    agente solo propone rutinas, «rechaza las rutinas» no significa nada: es
//    «rechaza lo que le llega».
// 3. **Las lecciones caducan solas.** Es consecuencia de la 2, y es el mecanismo
//    antidependencia de D-164 trasladado aquí: un agente silenciado deja de
//    generar decisiones, sus datos envejecen bajo `minDias`, la lección se cae y
//    el agente vuelve a hablar. El sistema vuelve a explorar sin que nadie se lo
//    pida. **Si alguien "arregla" esto para que la lección persista, habrá
//    construido una jaula.**

/** Una propuesta que la persona ya resolvió. Ni `pending` ni `aplicando`. */
export interface DecisionTomada {
  /** Qué agente la produjo. Hoy sale de `coach_proposals.origen`. */
  agenteId: string;
  /** `coach_proposals.tipo`: tarea, bloque, rutina, estructura, meta, foco… */
  tipo: string;
  status: "accepted" | "dismissed";
  /** `resolved_at`, en YYYY-MM-DD. Cuándo decidió, no cuándo se propuso. */
  decididaEl: string;
}

export interface UmbralesDecision {
  /** Días distintos con decisiones. Con menos, no se afirma NADA. */
  minDias: number;
  /** Decisiones de ese tipo. */
  minN: number;
  /** Decisiones que NO son de ese tipo. El contrafactual. */
  minSinN: number;
  /** Diferencia mínima de aceptación, en puntos porcentuales. */
  minLift: number;
  maxLecciones: number;
}

/**
 * Los mismos números que `UMBRALES` en `domain/identity/estilo.ts`, y a
 * propósito: son los que llevan meses sin producir una preferencia falsa. Dos
 * juegos de umbrales distintos para el mismo tipo de inferencia serían dos
 * cosas que calibrar y una que nadie recordaría por qué difiere.
 */
export const UMBRALES_DECISION: UmbralesDecision = {
  minDias: 14,
  minN: 7,
  minSinN: 4,
  minLift: 6,
  maxLecciones: 3
};

export type Confianza = "baja" | "media" | "alta";

export interface Leccion {
  tipo: string;
  /** `evitar`: se rechaza mucho más de lo normal. `preferir`: al revés. */
  veredicto: "evitar" | "preferir";
  /** Puntos porcentuales de diferencia contra el resto. Con signo. */
  lift: number;
  n: number;
  confianza: Confianza;
}

export interface LibroDeDecisiones {
  lecciones: Leccion[];
  /** Días distintos medidos. Se expone para poder decir «todavía no sé». */
  dias: number;
  /** Por qué no hay lecciones, cuando no las hay. Texto pintable. */
  motivo?: string;
}

function confianzaDe(n: number, lift: number): Confianza {
  if (n >= 20 && Math.abs(lift) >= 15) return "alta";
  if (n >= 12 && Math.abs(lift) >= 10) return "media";
  return "baja";
}

const pct = (aceptadas: number, total: number): number => (total === 0 ? 0 : (aceptadas / total) * 100);

/**
 * Qué tipos de propuesta funcionan y cuáles no, para esta persona.
 *
 * `desdeLaRevision` es la fecha de la última entrada de `identity_revisions`: lo
 * anterior se descarta entero. Pasarlo como `null` significa «nunca revisó», no
 * «da igual».
 */
export function libroDeDecisiones(
  decisiones: readonly DecisionTomada[],
  opciones: { desdeLaRevision?: string | null; umbrales?: Partial<UmbralesDecision> } = {}
): LibroDeDecisiones {
  const u = { ...UMBRALES_DECISION, ...opciones.umbrales };
  const corte = opciones.desdeLaRevision ?? null;

  // Salvaguarda 1: lo decidido por la persona que ya no quiere ser.
  const vigentes = corte ? decisiones.filter((d) => d.decididaEl >= corte) : [...decisiones];

  const dias = new Set(vigentes.map((d) => d.decididaEl)).size;
  if (dias < u.minDias) {
    return {
      lecciones: [],
      dias,
      motivo: `Todavía no hay suficientes días decididos (${dias} de ${u.minDias}) para afirmar nada.`
    };
  }

  const tipos = [...new Set(vigentes.map((d) => d.tipo))];
  const lecciones: Leccion[] = [];

  for (const tipo of tipos) {
    const con = vigentes.filter((d) => d.tipo === tipo);
    const sin = vigentes.filter((d) => d.tipo !== tipo);

    if (con.length < u.minN) continue;
    // Salvaguarda 2: sin contrafactual no hay nada que comparar, y por tanto
    // nada que aprender. No es un caso raro: es el caso normal al principio.
    if (sin.length < u.minSinN) continue;

    const lift =
      pct(con.filter((d) => d.status === "accepted").length, con.length) -
      pct(sin.filter((d) => d.status === "accepted").length, sin.length);

    if (Math.abs(lift) < u.minLift) continue;

    lecciones.push({
      tipo,
      veredicto: lift < 0 ? "evitar" : "preferir",
      lift: Math.round(lift),
      n: con.length,
      confianza: confianzaDe(con.length, lift)
    });
  }

  // Las más marcadas primero, y tope: tres. Una lista larga de preferencias
  // débiles es ruido con aspecto de conocimiento.
  lecciones.sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));

  return { lecciones: lecciones.slice(0, u.maxLecciones), dias };
}

/**
 * ¿Este agente lleva tanto tiempo siendo ignorado que debería callarse?
 *
 * Es la única lección que cambia la CONDUCTA del Kernel y no solo el prompt: un
 * agente al que no se le acepta nada no está ayudando, por buenas que sean sus
 * frases. Se mide contra el resto de agentes, no contra un umbral absoluto,
 * porque «se acepta poco» solo significa algo comparado con lo que sí se acepta.
 *
 * Y se cae sola, que es lo importante: silenciado el agente, deja de haber
 * decisiones suyas; en cuanto sus datos envejecen bajo `minDias`, esta función
 * devuelve `false` y el agente vuelve a hablar. Nadie tiene que acordarse de
 * reactivarlo, y el sistema no puede quedarse encerrado en su propia conclusión.
 */
export function enRechazoSostenido(
  decisiones: readonly DecisionTomada[],
  agenteId: string,
  opciones: { desdeLaRevision?: string | null; umbrales?: Partial<UmbralesDecision> } = {}
): boolean {
  const u = { ...UMBRALES_DECISION, ...opciones.umbrales };
  const corte = opciones.desdeLaRevision ?? null;
  const vigentes = corte ? decisiones.filter((d) => d.decididaEl >= corte) : [...decisiones];

  const dias = new Set(vigentes.map((d) => d.decididaEl)).size;
  if (dias < u.minDias) return false;

  const mias = vigentes.filter((d) => d.agenteId === agenteId);
  const otras = vigentes.filter((d) => d.agenteId !== agenteId);

  if (mias.length < u.minN) return false;
  if (otras.length < u.minSinN) return false;

  const lift =
    pct(mias.filter((d) => d.status === "accepted").length, mias.length) -
    pct(otras.filter((d) => d.status === "accepted").length, otras.length);

  return lift <= -u.minLift;
}

/**
 * Las lecciones, en frases que se le pueden dar al modelo.
 *
 * Equivalente a `preferenciasParaElPrompt()` de `estilo.ts`. Solo las de
 * confianza media o alta: decirle al modelo «creo, con poca confianza, que…» le
 * hace obedecer igual, y una corazonada obedecida es una corazonada convertida
 * en política.
 */
export function leccionesParaElPrompt(libro: LibroDeDecisiones): string[] {
  return libro.lecciones
    .filter((l) => l.confianza !== "baja")
    .map((l) =>
      l.veredicto === "evitar"
        ? `Evita proponer «${l.tipo}»: lo descarta casi siempre.`
        : `Las propuestas de «${l.tipo}» le funcionan: acepta bastante más de ese tipo.`
    );
}
