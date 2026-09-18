// src/lib/domain/identity/estilo.ts
// El libro de estilo — lógica pura (probada en tests/domain/identity-estilo.test.ts).
//
// LA PREGUNTA QUE CONTESTA: ¿qué forma de hablarle a ESTA persona acompaña a
// sus mejores días? No «qué frases motivan», que no se puede saber, sino qué
// rasgos medibles del brief —tono, longitud, tipo de escena, si lleva cifras,
// qué categorías tocó— aparecen en los días que después salieron bien.
//
// TRES PIEZAS, EN ORDEN CRONOLÓGICO:
//   1. `etiquetarEstilo`  — al escribir el brief: con qué estilo se le habló.
//   2. `medirDia`         — la noche siguiente: qué tal fue el día.
//   3. `libroDeEstilo`    — sobre el histórico: qué correlaciona con qué.
//
// POR QUÉ ESTO VIVE EN TYPESCRIPT Y NO EN EL AGENTE (D-164).
// El agente es un servicio Python aparte, y era tentador meter aquí su
// «aprendizaje». Tres razones para no hacerlo:
//   · lee datos que solo LifeOS tiene (registros de hábitos, reflexiones,
//     reacciones), y calcularlo fuera obligaría a enviar treinta días de crudo
//     por el cable cada mañana;
//   · tiene que sobrevivir a un agente caído — si vive en Python, el respaldo
//     escribe sin preferencias justo el día en que más se nota;
//   · es la pieza con más probabilidad de INVENTAR un patrón, y es la más
//     barata de probar aquí.
// La frontera queda así: TypeScript mide, Python redacta.
//
// EL MAYOR RIESGO NO ES EQUIVOCARSE: ES SONAR SEGURO CON TRES DÍAS DE DATOS.
// Por eso todos los umbrales de abajo son altos y están explicados, y por eso
// con menos de dos semanas medidas esto devuelve CERO preferencias en vez de
// una débil. Un agente que «aprende» de tres días no aprende: alucina con
// forma de estadística.

import type { Brief } from "./brief.ts";
import type { Categoria } from "./categorias.ts";

export type Tono = "sereno" | "directo" | "intenso";
export type Longitud = "corta" | "media" | "larga";
export type Escena = "logro" | "proceso" | "relacional" | "sensorial" | "tranquila";

export interface EtiquetasEstilo {
  tone: Tono;
  lengthBucket: Longitud;
  sceneKind: Escena;
  usesNumbers: boolean;
  categoryMix: Categoria[];
  affirmationCount: number;
}

/** Sin acentos y en minúsculas: las palabras clave de abajo se escriben así. */
function plano(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * De qué iba la escena.
 *
 * Se cuenta cuántas palabras clave de cada familia aparecen y gana la que más
 * tenga; en empate manda el orden de esta lista. `proceso` cierra la lista y es
 * el defecto porque es el caso soso: una escena que no celebra nada, no habla
 * con nadie y no describe sensaciones es una escena de trabajo.
 *
 * Es deliberadamente tosco. No hace falta acertar el género literario: hace
 * falta que la MISMA escena se etiquete SIEMPRE igual, porque lo que se
 * correlaciona después son las etiquetas, no los textos.
 */
const FAMILIAS: [Escena, string[]][] = [
  [
    "logro",
    ["premio", "escenario", "aplauso", "firma", "contrato", "cifra", "meta", "logrado", "conseguido", "resultado", "exito", "celebrar", "reconocimiento", "cheque"]
  ],
  [
    "relacional",
    ["conversacion", "dice", "dices", "mirada", "abrazo", "familia", "hijo", "hija", "pareja", "equipo", "socio", "amigo", "cliente", "reunion", "escuchan", "gente"]
  ],
  [
    "sensorial",
    ["respira", "aire", "piel", "olor", "huele", "calor", "frio", "taza", "luz", "sonido", "textura", "hombros", "pecho", "manos", "sabor", "peso"]
  ],
  ["tranquila", ["calma", "silencio", "quieto", "sereno", "serena", "paz", "lento", "descanso", "suave", "reposo", "tranquil"]],
  ["proceso", ["rutina", "manana", "entrenas", "escribes", "constancia", "habito", "paso", "trabajo", "disciplina"]]
];

export function tipoDeEscena(visualizacion: Brief["visualization"]): Escena {
  const texto = plano([visualizacion.title, ...visualizacion.steps.map((p) => p.text)].join(" "));
  let mejor: Escena = "proceso";
  let mejorCuenta = 0;
  for (const [escena, palabras] of FAMILIAS) {
    const cuenta = palabras.reduce((n, p) => (texto.includes(p) ? n + 1 : n), 0);
    if (cuenta > mejorCuenta) {
      mejor = escena;
      mejorCuenta = cuenta;
    }
  }
  return mejor;
}

/** Corta (<10 palabras), media (10-16), larga (>16), por la media del brief. */
export function longitudMedia(afirmaciones: { text: string }[]): Longitud {
  if (!afirmaciones.length) return "media";
  const media = afirmaciones.reduce((s, a) => s + a.text.split(/\s+/).filter(Boolean).length, 0) / afirmaciones.length;
  if (media < 10) return "corta";
  if (media <= 16) return "media";
  return "larga";
}

/**
 * Las etiquetas de un brief. Sin modelo y sin azar: el mismo brief produce
 * siempre las mismas, que es lo que permite compararlo con los de otros días.
 */
export function etiquetarEstilo(brief: Brief, perfil: { tono: Tono }): EtiquetasEstilo {
  const categorias = [...new Set(brief.affirmations.map((a) => a.category).filter((c): c is Categoria => c !== null))].sort();
  return {
    tone: perfil.tono,
    lengthBucket: longitudMedia(brief.affirmations),
    sceneKind: tipoDeEscena(brief.visualization),
    usesNumbers: brief.affirmations.some((a) => /\d/.test(a.text)),
    categoryMix: categorias,
    affirmationCount: brief.affirmations.length
  };
}

// ===========================================================================
// 2) LA MEDICIÓN DEL DÍA
// ===========================================================================

export interface EntradaMedicion {
  /** Cumplimiento de hábitos de ese día, 0-100. Null si no había hábitos que tocaran. */
  completionPct: number | null;
  /** Del check-in diario, 1-5. */
  mood: number | null;
  energy: number | null;
  /** Reacciones del brief: id de afirmación → reacción. */
  reactions: Record<string, string>;
  actionDone: boolean | null;
}

export interface ResultadoMedido {
  completionPct: number | null;
  mood: number | null;
  energy: number | null;
  /** De -100 a 100, o null si no tocó ningún pulgar. */
  reactionScore: number | null;
  actionDone: boolean | null;
  /** Qué tan bueno fue el día, 0-100. Null si no hubo con qué medirlo. */
  outcomeScore: number | null;
}

/** Cuánto pesa cada señal cuando están todas. Se renormaliza si falta alguna. */
const PESOS = { cumplimiento: 50, animo: 20, energia: 15, reaccion: 15 } as const;

/**
 * Cuántas señales hacen falta para llamar a esto «un día medido».
 *
 * Dos, y no una. Un día del que solo se sabe el ánimo no dice nada del brief:
 * dice que esa persona durmió mal. Con una sola señal el `outcomeScore` sería
 * esa señal con otro nombre, y el libro de estilo acabaría correlacionando
 * tonos con el estado de ánimo de la noche anterior.
 */
const MIN_SENALES = 2;

export function medirDia(e: EntradaMedicion): ResultadoMedido {
  const pulgares = Object.values(e.reactions).filter((r) => r === "resuena" || r === "no_resuena");
  const reactionScore = pulgares.length
    ? Math.round(((pulgares.filter((r) => r === "resuena").length - pulgares.filter((r) => r === "no_resuena").length) / pulgares.length) * 100)
    : null;

  // Cada señal se lleva a una escala 0-100 antes de mezclarlas. El ánimo y la
  // energía vienen de 1 a 5, así que el 1 es un 0 y no un 20: un día de ánimo
  // mínimo no es «un 20 % de buen día».
  const componentes: { peso: number; valor: number }[] = [];
  if (e.completionPct !== null) componentes.push({ peso: PESOS.cumplimiento, valor: Math.max(0, Math.min(100, e.completionPct)) });
  if (e.mood !== null) componentes.push({ peso: PESOS.animo, valor: ((Math.max(1, Math.min(5, e.mood)) - 1) / 4) * 100 });
  if (e.energy !== null) componentes.push({ peso: PESOS.energia, valor: ((Math.max(1, Math.min(5, e.energy)) - 1) / 4) * 100 });
  if (reactionScore !== null) componentes.push({ peso: PESOS.reaccion, valor: (reactionScore + 100) / 2 });

  const pesoTotal = componentes.reduce((s, c) => s + c.peso, 0);
  const outcomeScore =
    componentes.length >= MIN_SENALES && pesoTotal > 0
      ? Math.round(componentes.reduce((s, c) => s + c.peso * c.valor, 0) / pesoTotal)
      : null;

  return { completionPct: e.completionPct, mood: e.mood, energy: e.energy, reactionScore, actionDone: e.actionDone, outcomeScore };
}

// ===========================================================================
// 3) LA CORRELACIÓN
// ===========================================================================

export interface DiaMedido {
  localDate: string;
  etiquetas: EtiquetasEstilo;
  /** Ya no es null: los días sin medir se filtran antes de llegar aquí. */
  outcomeScore: number;
}

export type Confianza = "baja" | "media" | "alta";

export interface Preferencia {
  /** Qué se observó: «tono», «longitud», «escena», «cifras» o «categoría». */
  etiqueta: string;
  valor: string;
  /** Puntos de diferencia entre los días CON este rasgo y los días sin él. */
  lift: number;
  n: number;
  nSin: number;
  confianza: Confianza;
}

export interface LibroDeEstilo {
  /** Días medidos que entraron en el cálculo. */
  n: number;
  /** ¿Hay bastantes para decir algo? Si no, `preferencias` viene vacío. */
  suficiente: boolean;
  preferencias: Preferencia[];
  /** Qué contarle a la persona, en español llano. */
  nota: string;
}

export interface Umbrales {
  /** Días medidos por debajo de los cuales no se afirma NADA. */
  minDias: number;
  /** Días con el rasgo para que cuente. */
  minN: number;
  /** Días SIN el rasgo: sin contraste no hay comparación. */
  minSinN: number;
  /** Puntos de diferencia por debajo de los cuales es ruido. */
  minLift: number;
  maxPreferencias: number;
}

/**
 * Los umbrales, y por qué son estos.
 *
 * `minDias = 14`: dos semanas. Por debajo, cualquier rasgo tiene tan pocos días
 * a cada lado que la diferencia la decide un fin de semana.
 * `minN = 7` y `minSinN = 4`: hacen falta días de los dos tipos. Un rasgo que
 * aparece SIEMPRE no se puede evaluar — no hay contra qué compararlo—, y ese
 * caso es real: en cuanto una preferencia se refuerza, deja de haber días sin
 * ella. Es una propiedad deseada, no un fallo (ver `libroDeEstilo`).
 * `minLift = 6`: seis puntos sobre cien. Por debajo, la diferencia cabe dentro
 * de lo que mueve una noche de mal sueño.
 * `maxPreferencias = 3`: más de tres y el prompt deja de ser un libro de estilo
 * para ser ruido.
 */
export const UMBRALES: Umbrales = { minDias: 14, minN: 7, minSinN: 4, minLift: 6, maxPreferencias: 3 };

/** Todos los rasgos binarios que se evalúan, a partir de las etiquetas de un día. */
function rasgosDe(e: EtiquetasEstilo): { etiqueta: string; valor: string }[] {
  return [
    { etiqueta: "tono", valor: e.tone },
    { etiqueta: "longitud", valor: e.lengthBucket },
    { etiqueta: "escena", valor: e.sceneKind },
    { etiqueta: "cifras", valor: e.usesNumbers ? "con cifras" : "sin cifras" },
    ...e.categoryMix.map((c) => ({ etiqueta: "categoría", valor: c }))
  ];
}

function media(valores: number[]): number {
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

function confianzaDe(n: number, lift: number): Confianza {
  if (n >= 21 && Math.abs(lift) >= 10) return "alta";
  if (n >= 14) return "media";
  return "baja";
}

/**
 * Qué rasgos de estilo acompañan a los mejores días.
 *
 * DOS DEFENSAS CONTRA EL PATRÓN INVENTADO, y las dos importan:
 *
 *  1. **El suelo de días.** Con menos de `minDias` medidos esto devuelve cero
 *     preferencias y lo dice. No «una preferencia con poca confianza»: cero. Un
 *     sistema que susurra un patrón dudoso es peor que uno que calla, porque el
 *     modelo no sabe susurrar de vuelta.
 *  2. **La prueba de quitar el mejor día.** Se recalcula la diferencia sin el
 *     día más alto del grupo; si el signo cambia, el rasgo se descarta. Es lo
 *     que impide que un lunes excepcional dicte el tono de un mes, y es mucho
 *     más explicable que un p-valor que nadie va a leer en una pantalla.
 *
 * PROFECÍA AUTOCUMPLIDA: SE DEJA A PROPÓSITO. Si un tono funciona y se refuerza
 * hasta que ya no hay días sin él, `nSin` cae por debajo de `minSinN`, la
 * preferencia desaparece del libro y el sistema vuelve a variar. Es el
 * mecanismo de exploración de los pobres, sale gratis, y quien lo «arregle»
 * dejando pasar `nSin` pequeño convertirá la primera racha de suerte en una
 * norma permanente.
 */
export function libroDeEstilo(dias: DiaMedido[], opciones: Partial<Umbrales> = {}): LibroDeEstilo {
  const u = { ...UMBRALES, ...opciones };
  const n = dias.length;

  if (n < u.minDias) {
    return {
      n,
      suficiente: false,
      preferencias: [],
      nota:
        n === 0
          ? "Todavía no he medido ningún día, así que no tengo nada que decir sobre cómo escribirte."
          : `Llevo ${n} ${n === 1 ? "día medido" : "días medidos"}. Con menos de ${u.minDias}, cualquier patrón que te contara sería ruido.`
    };
  }

  // Cada rasgo se evalúa por separado: qué tal fueron los días que lo tenían
  // frente a los que no.
  // Primero el universo de rasgos vistos en CUALQUIER día, y solo después se
  // reparte cada día. El orden importa: un día que no llevaba la categoría
  // «Dinero» es información sobre «Dinero», y si el universo se fuera
  // ampliando sobre la marcha ese día ya habría pasado sin contarse en su
  // columna de «sin».
  const porRasgo = new Map<string, { etiqueta: string; valor: string; con: number[]; sin: number[] }>();
  for (const dia of dias) {
    for (const r of rasgosDe(dia.etiquetas)) {
      const clave = `${r.etiqueta}|${r.valor}`;
      if (!porRasgo.has(clave)) porRasgo.set(clave, { etiqueta: r.etiqueta, valor: r.valor, con: [], sin: [] });
    }
  }

  for (const dia of dias) {
    const suyos = new Set(rasgosDe(dia.etiquetas).map((r) => `${r.etiqueta}|${r.valor}`));
    for (const [clave, acc] of porRasgo) {
      (suyos.has(clave) ? acc.con : acc.sin).push(dia.outcomeScore);
    }
  }

  const preferencias: Preferencia[] = [];
  for (const acc of porRasgo.values()) {
    if (acc.con.length < u.minN || acc.sin.length < u.minSinN) continue;

    const lift = media(acc.con) - media(acc.sin);
    if (Math.abs(lift) < u.minLift) continue;

    // La prueba de robustez: sin el mejor día del grupo, ¿sigue apuntando al
    // mismo sitio? Un solo día afortunado no debe dictar nada.
    const sinElMejor = [...acc.con].sort((a, b) => a - b).slice(0, -1);
    if (sinElMejor.length) {
      const liftSinElMejor = media(sinElMejor) - media(acc.sin);
      if (Math.sign(liftSinElMejor) !== Math.sign(lift)) continue;
    }

    preferencias.push({
      etiqueta: acc.etiqueta,
      valor: acc.valor,
      lift: Math.round(lift),
      n: acc.con.length,
      nSin: acc.sin.length,
      confianza: confianzaDe(acc.con.length, lift)
    });
  }

  const orden: Record<Confianza, number> = { alta: 2, media: 1, baja: 0 };
  preferencias.sort((a, b) => orden[b.confianza] - orden[a.confianza] || Math.abs(b.lift) - Math.abs(a.lift));
  const top = preferencias.slice(0, u.maxPreferencias);

  return {
    n,
    suficiente: true,
    preferencias: top,
    nota: top.length
      ? `Sobre ${n} días medidos, esto es lo que parece funcionarte.`
      : `Llevo ${n} días medidos y todavía no veo ningún patrón claro en cómo te escribo.`
  };
}

/**
 * Las preferencias que merecen entrar en el prompt: solo las de confianza
 * media o alta. Las de confianza baja se enseñan en la pantalla como «todavía
 * observando», que es honesto, pero no se le dicen al modelo como si fueran
 * una conclusión.
 */
export function preferenciasParaElPrompt(libro: LibroDeEstilo): Preferencia[] {
  if (!libro.suficiente) return [];
  return libro.preferencias.filter((p) => p.confianza !== "baja");
}
