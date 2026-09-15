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
//   2. NO SE ATRIBUYE. Una cita que nombra a Hill, Goddard, Clear o Sharma, o
//      que termina con una raya y un nombre, se descarta: el producto promete
//      textos originales inspirados en principios, nunca frases de un autor.
//   3. NO SE INVENTA. Los rasgos y los hechos que cita tienen que existir.

export const PRINCIPIOS = ["hill", "goddard", "clear", "sharma"] as const;
export type Principio = (typeof PRINCIPIOS)[number];

/** Lo que devuelve el modelo, ya validado de forma por zod pero sin sanear. */
export interface BriefCrudo {
  afirmaciones: { texto: string; rasgoId: string }[];
  visualizacion: { titulo: string; pasos: { texto: string; segundos: number }[] };
  recordatorio: string;
  pregunta: string;
  cita: { texto: string; principio: string };
  factIds: string[];
}

/** Lo que se guarda en `identity_briefs`. */
export interface Brief {
  affirmations: { id: string; text: string; traitId: string | null }[];
  visualization: { title: string; durationMin: number; steps: { text: string; seconds: number }[] };
  identityReminder: string;
  reflectionQuestion: string;
  quote: { text: string; principle: Principio | null } | null;
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
 * ¿La cita se atribuye a alguien? Nombres de los cuatro autores (sin tratar
 * «clear» suelto como autor, que es una palabra) o una raya final seguida de
 * un nombre propio.
 */
export function citaAtribuida(texto: string): boolean {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/\b(napoleon\s+hill|hill|neville|goddard|james\s+clear|robin\s+sharma|sharma)\b/i.test(t)) return true;
  return /[—–―-]\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s*\.?\s*$/.test(t);
}

const MAX_AFIRMACION = 180;
const MAX_TEXTO = 300;
const MAX_PASO = 220;
const MIN_SEGUNDOS = 120;
const MAX_SEGUNDOS = 240;

function recortar(texto: string, max: number): string {
  const t = texto.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Pasos de la visualización con una duración total entre 2 y 4 minutos. Si el
 * modelo se queda corto o se pasa, se reparte proporcionalmente: el orden y el
 * peso relativo de cada paso los decidió él, el reloj lo pone el producto.
 */
function ajustarPasos(pasos: { texto: string; segundos: number }[]): { text: string; seconds: number }[] {
  const limpios = pasos
    .map((p) => ({ text: recortar(p.texto, MAX_PASO), seconds: Math.round(Math.min(90, Math.max(10, p.segundos || 0))) }))
    .filter((p) => p.text)
    .slice(0, 8);
  if (!limpios.length) return [];

  const total = limpios.reduce((s, p) => s + p.seconds, 0);
  const objetivo = Math.min(MAX_SEGUNDOS, Math.max(MIN_SEGUNDOS, total));
  if (objetivo === total) return limpios;

  const escalados = limpios.map((p) => ({ ...p, seconds: Math.floor((p.seconds * objetivo) / total) }));
  const resto = objetivo - escalados.reduce((s, p) => s + p.seconds, 0);
  escalados[escalados.length - 1]!.seconds += resto;
  return escalados;
}

export function sanearBrief(
  crudo: BriefCrudo,
  contexto: { rasgos: Set<string>; hechos: Set<string>; previas: string[] }
): ResultadoSaneado {
  const problemas: string[] = [];

  const candidatas = crudo.afirmaciones
    .map((a) => ({ texto: recortar(a.texto, MAX_AFIRMACION), rasgoId: a.rasgoId }))
    .filter((a) => a.texto);
  const { kept, rejected } = filtrarRepetidas(
    candidatas.map((a) => a.texto),
    contexto.previas
  );
  if (rejected.length) problemas.push(`${rejected.length} afirmaciones se repetían con días anteriores o entre sí.`);

  const affirmations = kept.slice(0, 5).map((texto, i) => {
    const rasgo = candidatas.find((c) => c.texto === texto)?.rasgoId ?? "";
    return { id: `a${i + 1}`, text: texto, traitId: contexto.rasgos.has(rasgo) ? rasgo : null };
  });
  if (affirmations.length < 5) problemas.push(`Faltan afirmaciones: hay ${affirmations.length} de 5.`);

  const steps = ajustarPasos(crudo.visualizacion.pasos);
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

  const brief: Brief = {
    affirmations,
    visualization: {
      title: recortar(crudo.visualizacion.titulo, 120) || "Visualización",
      durationMin: Math.min(4, Math.max(2, Math.round(totalSegundos / 60))),
      steps
    },
    identityReminder,
    reflectionQuestion,
    quote,
    factIds: [...new Set(crudo.factIds.filter((id) => contexto.hechos.has(id)))]
  };

  // Tres afirmaciones es el mínimo que se enseña: menos no es un brief, es un
  // fallo con buena cara. La cita puede faltar; recordatorio y pregunta, no.
  const ok = affirmations.length >= 3 && steps.length > 0 && Boolean(identityReminder) && Boolean(reflectionQuestion);
  return { ok, brief, problemas, rechazadas: rejected };
}
