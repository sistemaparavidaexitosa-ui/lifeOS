// src/lib/domain/identity/brief.ts
// Saneado del brief de identidad — lógica pura (probada en
// tests/domain/identity-brief.test.ts).
//
// El modelo propone; esto decide qué se guarda. Tres garantías que no pueden
// depender de que el prompt se obedezca (D-161):
//   1. NO SE REPITE. Una afirmación demasiado parecida a las de los últimos
//      días se descarta. Sin embeddings (invariante del sistema cognitivo):
//      Jaccard sobre palabras significativas, que para frases cortas basta y
//      se puede explicar.
//   2. NO SE ATRIBUYE. Una cita que nombra a Hill, Goddard, Clear, Sharma o
//      Dispenza, o que termina con una raya y un nombre, se descarta: el
//      producto promete textos originales inspirados en principios, nunca
//      frases de un autor.
//   3. NO SE INVENTA. Los rasgos y los hechos que cita tienen que existir.
//
// DESDE D-164 ESTO TIENE DOS CLIENTES, Y POR ESO ESTÁ PARAMETRIZADO.
// El brief lo escribe un agente en Python (10-20 afirmaciones, una escena de
// cinco minutos con arco de nueve tiempos) y, cuando ese agente no responde, el
// respaldo de `generar.ts` (5 afirmaciones, de dos a cuatro minutos). Los
// límites viajan como argumento en vez de estar cableados porque el respaldo
// tiene que seguir comportándose EXACTAMENTE como antes: subirlos a pelo habría
// cambiado en silencio lo que se le pide al respaldo y, con ello, la línea base
// contra la que el libro de estilo compara los días.

import { areaDe, categoriaDe, type Area, type Categoria } from "./categorias.ts";

export const PRINCIPIOS = ["hill", "goddard", "clear", "sharma", "dispenza"] as const;
export type Principio = (typeof PRINCIPIOS)[number];

/**
 * Cuánto cabe en un brief. Ver la cabecera: dos clientes, dos perfiles.
 *
 * `objetivo` no es lo mismo que `max`. `max` es el techo que se recorta; el
 * `objetivo` es la cifra por debajo de la cual se pide un reintento. Para el
 * respaldo coinciden (siempre se piden cinco); para el agente no, porque de
 * diez a veinte es un rango legítimo y exigirle veinte convertiría cada brief
 * honesto de catorce en un reintento inútil.
 */
export interface Limites {
  /** Por debajo de esto el brief no se enseña: es un fallo con buena cara. */
  minAfirmaciones: number;
  /** Por debajo de esto se pide un reintento, pero el brief se sostiene. */
  objetivoAfirmaciones: number;
  maxAfirmaciones: number;
  minSegundos: number;
  maxSegundos: number;
  maxPasos: number;
  maxSegundosPaso: number;
}

/** Lo de siempre: cinco afirmaciones y de dos a cuatro minutos. */
export const LIMITES_RESPALDO: Limites = {
  minAfirmaciones: 3,
  objetivoAfirmaciones: 5,
  maxAfirmaciones: 5,
  minSegundos: 120,
  maxSegundos: 240,
  maxPasos: 8,
  maxSegundosPaso: 90
};

/**
 * Lo que puede el agente. Los doce pasos no son generosidad: el arco pedido son
 * NUEVE tiempos (respiración, calma, escena, sensaciones, conversaciones,
 * resultados, emoción, gratitud, regreso) y con el tope de ocho de antes se
 * perdían los dos últimos —gratitud y regreso— sin un solo aviso. Doce deja
 * margen para que un tiempo se parta en dos sin amputar el final.
 */
export const LIMITES_AGENTE: Limites = {
  minAfirmaciones: 10,
  objetivoAfirmaciones: 10,
  maxAfirmaciones: 20,
  minSegundos: 240,
  maxSegundos: 420,
  maxPasos: 12,
  maxSegundosPaso: 120
};

/** Lo que devuelve el modelo, ya validado de forma por zod pero sin sanear. */
export interface BriefCrudo {
  afirmaciones: { texto: string; rasgoId: string; categoria?: string }[];
  visualizacion: { titulo: string; pasos: { texto: string; segundos: number }[] };
  recordatorio: string;
  pregunta: string;
  cita: { texto: string; principio: string };
  /** Desde D-164, y opcionales: el respaldo no los escribe. */
  mantra?: string;
  accionDelDia?: { texto: string; rasgoId?: string; area?: string };
  focusArea?: string;
  factIds: string[];
}

/** Lo que se guarda en `identity_briefs`. */
export interface Brief {
  affirmations: { id: string; text: string; traitId: string | null; category: Categoria | null }[];
  visualization: { title: string; durationMin: number; steps: { text: string; seconds: number }[] };
  identityReminder: string;
  reflectionQuestion: string;
  quote: { text: string; principle: Principio | null } | null;
  /**
   * Nulos cuando lo escribió el respaldo. La pantalla omite lo que falta; es lo
   * que permite que un agente caído dé un brief más corto en vez de ninguno.
   */
  mantra: string | null;
  dailyAction: { text: string; traitId: string | null; area: Area | null } | null;
  focusArea: Area | null;
  factIds: string[];
}

export interface ResultadoSaneado {
  ok: boolean;
  brief?: Brief;
  /** Qué hubo que corregir: se le devuelve al modelo en el reintento. */
  problemas: string[];
  /** Afirmaciones descartadas por repetidas, para pedir otras distintas. */
  rechazadas: string[];
}

const VACIAS = new Set(
  "de la que el en y a los las se del un una unos unas por con no su sus para es al lo como mas pero le ya me mi mis tu tus te hoy yo son ser esta este esto estos estas eso esa ese muy sin sobre entre cada".split(
    " "
  )
);

/** Palabras que cuentan para comparar: minúsculas, sin acentos ni puntuación, sin palabras vacías. */
export function tokensSignificativos(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !VACIAS.has(t));
}

/** Jaccard entre los conjuntos de palabras significativas de dos frases (0..1). */
export function similitud(a: string, b: string): number {
  const A = new Set(tokensSignificativos(a));
  const B = new Set(tokensSignificativos(b));
  if (A.size === 0 && B.size === 0) return 0;
  let comun = 0;
  for (const t of A) if (B.has(t)) comun++;
  return comun / (A.size + B.size - comun);
}

/** A partir de aquí dos afirmaciones dicen lo mismo con otras palabras. */
export const UMBRAL_REPETIDA = 0.6;

export function filtrarRepetidas(
  nuevas: string[],
  previas: string[],
  umbral = UMBRAL_REPETIDA
): { kept: string[]; rejected: string[] } {
  const kept: string[] = [];
  const rejected: string[] = [];
  for (const n of nuevas) {
    const repetida = [...previas, ...kept].some((p) => similitud(n, p) >= umbral);
    (repetida ? rejected : kept).push(n);
  }
  return { kept, rejected };
}

/**
 * ¿La cita se atribuye a alguien? Nombres de los cinco autores (sin tratar
 * «clear» suelto como autor, que es una palabra) o una raya final seguida de
 * un nombre propio.
 *
 * Dispenza entra aquí en el mismo cambio que lo añade al catálogo de
 * inspiraciones, y no después: una inspiración que se puede elegir pero cuyo
 * autor no se detecta sería la única colable con nombre y apellido.
 */
export function citaAtribuida(texto: string): boolean {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/\b(napoleon\s+hill|hill|neville|goddard|james\s+clear|robin\s+sharma|sharma|joe\s+dispenza|dispenza)\b/i.test(t)) return true;
  return /[—–―-]\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s*\.?\s*$/.test(t);
}

const MAX_AFIRMACION = 180;
const MAX_TEXTO = 300;
const MAX_PASO = 220;
const MAX_MANTRA_PALABRAS = 20;
const MAX_MANTRA = 140;
const MIN_MANTRA = 8;
const MIN_ACCION = 15;
const MAX_ACCION = 160;

function recortar(texto: string, max: number): string {
  const t = texto.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * El mantra: UNA frase, como mucho veinte palabras.
 *
 * No se recorta a la fuerza como el resto de textos. Un mantra cortado por la
 * mitad con puntos suspensivos no es un mantra corto: es basura que la persona
 * va a repetirse en voz alta. Si no cabe, se descarta y se pide otro.
 *
 * Se rechaza también la frase múltiple. El valor del mantra es que se recuerda
 * de una pieza; dos oraciones ya son un párrafo. El signo final no cuenta, para
 * no castigar un «Hoy cumplo lo que prometo.» bien puntuado.
 */
export function sanearMantra(valor: string | undefined | null): { mantra: string | null; problema: string | null } {
  if (valor === undefined || valor === null) return { mantra: null, problema: null };

  const t = valor.trim().replace(/\s+/g, " ").replace(/^["«»']|["«»']$/g, "").trim();
  if (!t) return { mantra: null, problema: "El mantra llegó vacío." };
  if (t.length < MIN_MANTRA) return { mantra: null, problema: "El mantra es demasiado corto para decir nada." };

  // Las palabras se cuentan ANTES que los caracteres, y no da igual: veinte
  // palabras es la regla del producto y el caracter es solo un tope de
  // seguridad. Al revés, un mantra de veintiuna palabras largas se rechazaba
  // con un motivo —«pasa de 140 caracteres»— que no dice lo que hay que
  // cambiar, y el reintento venía igual de largo en palabras.
  const palabras = t.split(" ").filter(Boolean).length;
  if (palabras > MAX_MANTRA_PALABRAS) {
    return { mantra: null, problema: `El mantra tiene ${palabras} palabras y el tope son ${MAX_MANTRA_PALABRAS}.` };
  }

  if (t.length > MAX_MANTRA) return { mantra: null, problema: `El mantra pasa de ${MAX_MANTRA} caracteres; escríbelo más corto.` };

  const cuerpo = t.replace(/[.!?…]+$/, "");
  if (/[.!?](\s|$)/.test(cuerpo)) return { mantra: null, problema: "El mantra tiene que ser UNA sola frase." };

  return { mantra: t, problema: null };
}

/**
 * Aperturas que delatan una acción abstracta. Lista cerrada y corta a
 * propósito: cada entrada es una forma de no comprometerse con nada que se
 * pueda terminar antes de dormir.
 */
const APERTURAS_VAGAS = [
  "se mas",
  "se menos",
  "sientete",
  "mantente",
  "permanece",
  "sigue siendo",
  "sigue asi",
  "confia en",
  "cree en",
  "recuerda que",
  "recuerda lo",
  "piensa en",
  "reflexiona sobre",
  "enfocate en ser",
  "enfocate en sentir",
  "intenta",
  "trata de",
  "procura",
  "busca ser",
  "esfuerzate",
  "visualiza",
  "imagina"
];

/**
 * La acción del día: concreta, no abstracta. «Llama al cliente antes de las
 * 11», no «sé más constante».
 *
 * ESTO ES UN SUELO, NO UNA GARANTÍA, y conviene decirlo aquí para que nadie lo
 * confunda con lo que hace `filtrarRepetidas`. Que una acción sea de verdad
 * concreta lo consigue el prompt; lo único que puede hacer una función pura sin
 * entender español es rechazar lo OBVIAMENTE abstracto: lo demasiado corto, lo
 * que empieza pidiendo un estado de ánimo en vez de un acto, y lo que no llega
 * ni a tres palabras. Se prefiere dejar pasar una acción tibia a bloquear una
 * buena por una heurística que no puede razonar.
 */
export function sanearAccionDelDia(
  valor: BriefCrudo["accionDelDia"],
  contexto: { rasgos: Set<string> }
): { accion: Brief["dailyAction"]; problema: string | null } {
  if (!valor) return { accion: null, problema: null };

  const texto = recortar(valor.texto ?? "", MAX_ACCION);
  if (!texto) return { accion: null, problema: "La acción del día llegó vacía." };
  if (texto.length < MIN_ACCION) {
    return { accion: null, problema: "La acción del día es demasiado vaga; di qué hacer y cuándo." };
  }
  if (texto.split(" ").filter(Boolean).length < 3) {
    return { accion: null, problema: "La acción del día tiene que decir algo que se pueda hacer, no una palabra." };
  }

  const plano = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (APERTURAS_VAGAS.some((a) => plano.startsWith(a))) {
    return {
      accion: null,
      problema: `«${texto}» es un estado de ánimo, no una acción. Escribe algo que se pueda terminar hoy.`
    };
  }

  const rasgoId = valor.rasgoId ?? "";
  return {
    accion: { text: texto, traitId: contexto.rasgos.has(rasgoId) ? rasgoId : null, area: areaDe(valor.area) },
    problema: null
  };
}

/**
 * Pasos de la visualización con una duración total dentro del rango de los
 * límites. Si el modelo se queda corto o se pasa, se reparte
 * proporcionalmente: el orden y el peso relativo de cada paso los decidió él,
 * el reloj lo pone el producto.
 */
function ajustarPasos(pasos: { texto: string; segundos: number }[], limites: Limites): { text: string; seconds: number }[] {
  const limpios = pasos
    .map((p) => ({
      text: recortar(p.texto, MAX_PASO),
      seconds: Math.round(Math.min(limites.maxSegundosPaso, Math.max(10, p.segundos || 0)))
    }))
    .filter((p) => p.text)
    .slice(0, limites.maxPasos);
  if (!limpios.length) return [];

  const total = limpios.reduce((s, p) => s + p.seconds, 0);
  const objetivo = Math.min(limites.maxSegundos, Math.max(limites.minSegundos, total));
  if (objetivo === total) return limpios;

  const escalados = limpios.map((p) => ({ ...p, seconds: Math.floor((p.seconds * objetivo) / total) }));
  const resto = objetivo - escalados.reduce((s, p) => s + p.seconds, 0);
  escalados[escalados.length - 1]!.seconds += resto;
  return escalados;
}

export function sanearBrief(
  crudo: BriefCrudo,
  contexto: { rasgos: Set<string>; hechos: Set<string>; previas: string[] },
  limites: Limites = LIMITES_RESPALDO
): ResultadoSaneado {
  const problemas: string[] = [];

  const candidatas = crudo.afirmaciones
    .map((a) => ({ texto: recortar(a.texto, MAX_AFIRMACION), rasgoId: a.rasgoId, categoria: a.categoria }))
    .filter((a) => a.texto);
  const { kept, rejected } = filtrarRepetidas(
    candidatas.map((a) => a.texto),
    contexto.previas
  );
  if (rejected.length) problemas.push(`${rejected.length} afirmaciones se repetían con días anteriores o entre sí.`);

  const affirmations = kept.slice(0, limites.maxAfirmaciones).map((texto, i) => {
    const origen = candidatas.find((c) => c.texto === texto);
    const rasgo = origen?.rasgoId ?? "";
    return {
      id: `a${i + 1}`,
      text: texto,
      traitId: contexto.rasgos.has(rasgo) ? rasgo : null,
      // Una categoría que no se reconoce NO tumba la afirmación: se queda sin
      // etiqueta y la pantalla la agrupa en «Otras». La afirmación es el
      // producto; la categoría, cómo se ordena.
      category: categoriaDe(origen?.categoria)
    };
  });
  if (affirmations.length < limites.objetivoAfirmaciones) {
    problemas.push(`Faltan afirmaciones: hay ${affirmations.length} de ${limites.objetivoAfirmaciones}.`);
  }

  const steps = ajustarPasos(crudo.visualizacion.pasos, limites);
  if (!steps.length) problemas.push("La visualización no tiene pasos.");
  const totalSegundos = steps.reduce((s, p) => s + p.seconds, 0);

  const identityReminder = recortar(crudo.recordatorio, MAX_TEXTO);
  const reflectionQuestion = recortar(crudo.pregunta, MAX_TEXTO);
  if (!identityReminder) problemas.push("Falta el recordatorio de identidad.");
  if (!reflectionQuestion) problemas.push("Falta la pregunta de reflexión.");

  const textoCita = recortar(crudo.cita.texto, 240);
  let quote: Brief["quote"] = null;
  if (!textoCita || citaAtribuida(textoCita)) {
    problemas.push("La cita estaba vacía o atribuida a un autor; tiene que ser original y sin nombres.");
  } else {
    quote = {
      text: textoCita,
      principle: (PRINCIPIOS as readonly string[]).includes(crudo.cita.principio) ? (crudo.cita.principio as Principio) : null
    };
  }

  const { mantra, problema: problemaMantra } = sanearMantra(crudo.mantra);
  if (problemaMantra) problemas.push(problemaMantra);

  const { accion: dailyAction, problema: problemaAccion } = sanearAccionDelDia(crudo.accionDelDia, contexto);
  if (problemaAccion) problemas.push(problemaAccion);

  // Un área de foco que no existe no es un error que merezca un reintento: es
  // una etiqueta de más. Se cae y el brief sigue en pie.
  const focusArea = areaDe(crudo.focusArea);

  const brief: Brief = {
    affirmations,
    visualization: {
      title: recortar(crudo.visualizacion.titulo, 120) || "Visualización",
      durationMin: Math.min(
        Math.round(limites.maxSegundos / 60),
        Math.max(Math.round(limites.minSegundos / 60), Math.round(totalSegundos / 60))
      ),
      steps
    },
    identityReminder,
    reflectionQuestion,
    quote,
    mantra,
    dailyAction,
    focusArea,
    factIds: [...new Set(crudo.factIds.filter((id) => contexto.hechos.has(id)))]
  };

  // El mínimo que se enseña: menos no es un brief, es un fallo con buena cara.
  // La cita, el mantra y la acción pueden faltar —el respaldo no los escribe
  // nunca—; recordatorio y pregunta, no.
  const ok =
    affirmations.length >= limites.minAfirmaciones && steps.length > 0 && Boolean(identityReminder) && Boolean(reflectionQuestion);
  return { ok, brief, problemas, rechazadas: rejected };
}
