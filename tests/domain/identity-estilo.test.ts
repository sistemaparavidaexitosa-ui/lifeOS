import { test } from "node:test";
import assert from "node:assert/strict";
import {
  etiquetarEstilo,
  libroDeEstilo,
  longitudMedia,
  medirDia,
  preferenciasParaElPrompt,
  tipoDeEscena,
  type DiaMedido,
  type EtiquetasEstilo,
  type Tono
} from "../../src/lib/domain/identity/estilo.ts";
import type { Brief } from "../../src/lib/domain/identity/brief.ts";

function brief(extra: Partial<Brief> = {}): Brief {
  return {
    affirmations: [
      { id: "a1", text: "Cumplo lo que me prometo aunque nadie mire", traitId: null, category: "Disciplina" },
      { id: "a2", text: "Cada peso ahorrado compra libertad", traitId: null, category: "Dinero" }
    ],
    visualization: {
      title: "El martes de octubre",
      durationMin: 5,
      steps: [{ text: "Respira hondo y nota el peso de la taza en las manos.", seconds: 40 }]
    },
    identityReminder: "r",
    reflectionQuestion: "p",
    quote: null,
    mantra: null,
    dailyAction: null,
    focusArea: null,
    factIds: [],
    ...extra
  };
}

// ===========================================================================
// 1) ETIQUETADO
// ===========================================================================

test("etiquetarEstilo: el mismo brief produce siempre las mismas etiquetas", () => {
  const e1 = etiquetarEstilo(brief(), { tono: "directo" });
  const e2 = etiquetarEstilo(brief(), { tono: "directo" });
  assert.deepEqual(e1, e2);
  assert.equal(e1.tone, "directo");
  assert.equal(e1.affirmationCount, 2);
  assert.deepEqual(e1.categoryMix, ["Dinero", "Disciplina"], "ordenadas, para que dos briefs iguales no parezcan distintos");
});

test("etiquetarEstilo: las cifras se detectan en el texto de las afirmaciones", () => {
  assert.equal(etiquetarEstilo(brief(), { tono: "sereno" }).usesNumbers, false);
  const conCifra = brief({
    affirmations: [{ id: "a1", text: "Entreno 5 mañanas por semana sin negociarlo", traitId: null, category: "Salud" }]
  });
  assert.equal(etiquetarEstilo(conCifra, { tono: "sereno" }).usesNumbers, true);
});

test("longitudMedia: corta, media y larga por la media de palabras", () => {
  assert.equal(longitudMedia([{ text: "Cumplo lo que prometo" }]), "corta");
  assert.equal(longitudMedia([{ text: "Cumplo lo que me prometo aunque nadie me esté mirando hoy mismo" }]), "media");
  assert.equal(
    longitudMedia([{ text: "Cumplo cada una de las promesas que me hago a mí mismo aunque nadie las esté mirando nunca jamás" }]),
    "larga"
  );
  assert.equal(longitudMedia([]), "media", "un brief sin afirmaciones no es ni corto ni largo");
});

test("tipoDeEscena: gana la familia con más palabras clave; «proceso» es el defecto", () => {
  assert.equal(
    tipoDeEscena({ title: "El contrato", durationMin: 5, steps: [{ text: "Firmas el contrato y celebras la cifra conseguida.", seconds: 30 }] }),
    "logro"
  );
  assert.equal(
    tipoDeEscena({ title: "En casa", durationMin: 5, steps: [{ text: "Tu pareja te abraza y tu hija te dice algo.", seconds: 30 }] }),
    "relacional"
  );
  assert.equal(
    tipoDeEscena({ title: "Sin nada", durationMin: 5, steps: [{ text: "Sigues adelante con lo tuyo.", seconds: 30 }] }),
    "proceso"
  );
});

// ===========================================================================
// 2) MEDICIÓN
// ===========================================================================

test("medirDia: con una sola señal NO hay día medido", () => {
  // Un día del que solo se sabe el ánimo dice que se durmió mal, no que el
  // brief funcionara.
  const r = medirDia({ completionPct: null, mood: 4, energy: null, reactions: {}, actionDone: null });
  assert.equal(r.outcomeScore, null);
  assert.equal(r.mood, 4, "la señal se conserva aunque no baste para puntuar");
});

test("medirDia: los pesos se renormalizan sobre lo que hay", () => {
  // Solo cumplimiento y ánimo, los dos al máximo: el día es un 100 aunque
  // falten energía y reacciones. Sin renormalizar saldría 70.
  const r = medirDia({ completionPct: 100, mood: 5, energy: null, reactions: {}, actionDone: null });
  assert.equal(r.outcomeScore, 100);

  const cero = medirDia({ completionPct: 0, mood: 1, energy: null, reactions: {}, actionDone: null });
  assert.equal(cero.outcomeScore, 0, "ánimo 1 es un 0, no un 20");
});

test("medirDia: el marcador de reacciones va de -100 a 100", () => {
  assert.equal(medirDia({ completionPct: 50, mood: null, energy: null, reactions: { a1: "resuena", a2: "resuena" }, actionDone: null }).reactionScore, 100);
  assert.equal(medirDia({ completionPct: 50, mood: null, energy: null, reactions: { a1: "resuena", a2: "no_resuena" }, actionDone: null }).reactionScore, 0);
  assert.equal(medirDia({ completionPct: 50, mood: null, energy: null, reactions: {}, actionDone: null }).reactionScore, null);
});

// ===========================================================================
// 3) CORRELACIÓN — donde más fácil es inventarse un patrón
// ===========================================================================

function etiquetas(extra: Partial<EtiquetasEstilo> = {}): EtiquetasEstilo {
  return { tone: "directo", lengthBucket: "media", sceneKind: "proceso", usesNumbers: false, categoryMix: [], affirmationCount: 12, ...extra };
}

/** `n` días con un tono y una puntuación fijos. */
function dias(n: number, tono: Tono, score: number, desde = 1): DiaMedido[] {
  return Array.from({ length: n }, (_, i) => ({
    localDate: `2026-09-${String(desde + i).padStart(2, "0")}`,
    etiquetas: etiquetas({ tone: tono }),
    outcomeScore: score
  }));
}

test("con menos de catorce días medidos no se afirma NADA", () => {
  const libro = libroDeEstilo([...dias(7, "intenso", 85), ...dias(6, "sereno", 50, 10)]);
  assert.equal(libro.n, 13);
  assert.equal(libro.suficiente, false);
  assert.deepEqual(libro.preferencias, [], "un patrón dudoso susurrado es peor que el silencio");
  assert.match(libro.nota, /13 días medidos/);
  assert.match(libro.nota, /ruido/);
  assert.deepEqual(preferenciasParaElPrompt(libro), []);
});

test("sin ningún día medido lo dice sin rodeos", () => {
  const libro = libroDeEstilo([]);
  assert.equal(libro.suficiente, false);
  assert.match(libro.nota, /no he medido ningún día/);
});

test("con datos suficientes encuentra el tono que acompaña a los mejores días", () => {
  const libro = libroDeEstilo([...dias(10, "intenso", 85), ...dias(8, "sereno", 60, 11)]);
  assert.equal(libro.suficiente, true);
  const tono = libro.preferencias.find((p) => p.etiqueta === "tono" && p.valor === "intenso");
  assert.ok(tono, "debería ver el tono intenso");
  assert.equal(tono!.lift, 25);
  assert.equal(tono!.n, 10);
  assert.equal(tono!.nSin, 8);
});

test("un rasgo que aparece SIEMPRE no se puede evaluar, y por eso se cae solo", () => {
  // Es la profecía autocumplida: en cuanto una preferencia se refuerza tanto
  // que no quedan días sin ella, desaparece del libro y el sistema vuelve a
  // variar. Es una propiedad deseada, no un fallo.
  const libro = libroDeEstilo(dias(20, "intenso", 85));
  assert.equal(libro.suficiente, true);
  assert.equal(
    libro.preferencias.find((p) => p.valor === "intenso"),
    undefined
  );
});

test("un rasgo con pocos días de contraste se descarta", () => {
  // 16 días con tono intenso y solo 2 sin él: nSin = 2 < 4.
  const libro = libroDeEstilo([...dias(16, "intenso", 85), ...dias(2, "sereno", 40, 17)]);
  assert.equal(
    libro.preferencias.find((p) => p.valor === "intenso"),
    undefined
  );
});

test("una diferencia pequeña es ruido, no una preferencia", () => {
  const libro = libroDeEstilo([...dias(9, "intenso", 72), ...dias(9, "sereno", 69, 10)]);
  assert.equal(
    libro.preferencias.find((p) => p.etiqueta === "tono"),
    undefined,
    "3 puntos caben dentro de una mala noche"
  );
});

test("un solo día afortunado no dicta el estilo de un mes", () => {
  // Siete días con tono intenso: seis mediocres y uno excepcional. La media
  // sale por encima, pero quitando el mejor día el signo se invierte.
  const conIntenso: DiaMedido[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ localDate: `2026-09-0${i + 1}`, etiquetas: etiquetas({ tone: "intenso" as Tono }), outcomeScore: 48 })),
    { localDate: "2026-09-07", etiquetas: etiquetas({ tone: "intenso" }), outcomeScore: 100 }
  ];
  const conSereno = dias(8, "sereno", 55, 10);

  const libro = libroDeEstilo([...conIntenso, ...conSereno]);
  assert.equal(
    libro.preferencias.find((p) => p.valor === "intenso"),
    undefined,
    "el lift positivo lo sostenía un único día"
  );
});

test("como mucho tres preferencias, y las de confianza baja no llegan al prompt", () => {
  // Muchos rasgos distintos correlacionados a la vez.
  const buenos: DiaMedido[] = Array.from({ length: 10 }, (_, i) => ({
    localDate: `2026-09-${String(i + 1).padStart(2, "0")}`,
    etiquetas: etiquetas({ tone: "intenso", lengthBucket: "corta", sceneKind: "logro", usesNumbers: true, categoryMix: ["Dinero"] }),
    outcomeScore: 88
  }));
  const malos: DiaMedido[] = Array.from({ length: 9 }, (_, i) => ({
    localDate: `2026-09-${String(i + 11).padStart(2, "0")}`,
    etiquetas: etiquetas({ tone: "sereno", lengthBucket: "larga", sceneKind: "tranquila", usesNumbers: false, categoryMix: ["Salud"] }),
    outcomeScore: 55
  }));

  const libro = libroDeEstilo([...buenos, ...malos]);
  assert.ok(libro.preferencias.length <= 3, `salieron ${libro.preferencias.length}`);
  for (const p of preferenciasParaElPrompt(libro)) {
    assert.notEqual(p.confianza, "baja", "lo dudoso se enseña en pantalla, no se le dice al modelo");
  }
});

test("cada preferencia viaja con su evidencia: lift, n y días sin el rasgo", () => {
  const libro = libroDeEstilo([...dias(10, "intenso", 85), ...dias(8, "sereno", 60, 11)]);
  for (const p of libro.preferencias) {
    assert.equal(typeof p.lift, "number");
    assert.ok(p.n >= 7);
    assert.ok(p.nSin >= 4);
    assert.ok(["baja", "media", "alta"].includes(p.confianza));
  }
});
