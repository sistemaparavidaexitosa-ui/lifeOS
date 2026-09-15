import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokensSignificativos,
  similitud,
  filtrarRepetidas,
  citaAtribuida,
  sanearBrief,
  type BriefCrudo
} from "../../src/lib/domain/identity/brief.ts";

function crudo(extra: Partial<BriefCrudo> = {}): BriefCrudo {
  return {
    afirmaciones: [
      { texto: "Cumplo lo que me prometo, aunque nadie me mire.", rasgoId: "t1" },
      { texto: "Cada peso que ahorro compra mi libertad futura.", rasgoId: "t2" },
      { texto: "Mi cuerpo responde a la disciplina que le doy cada mañana.", rasgoId: "" },
      { texto: "Termino lo que empiezo antes de abrir algo nuevo.", rasgoId: "inventado" },
      { texto: "Mis decisiones de hoy votan por la persona que estoy construyendo.", rasgoId: "t1" }
    ],
    visualizacion: {
      titulo: "Tu mañana dentro de un año",
      pasos: [
        { texto: "Cierra los ojos y respira tres veces.", segundos: 30 },
        { texto: "Imagina que despiertas sin alarma, a las 5:30.", segundos: 60 },
        { texto: "Siente el orgullo de haber entrenado 200 mañanas.", segundos: 60 },
        { texto: "Abre los ojos y elige la primera acción.", segundos: 30 }
      ]
    },
    recordatorio: "Hoy no tienes que sentirte disciplinado: tienes que actuar como alguien que lo es.",
    pregunta: "¿Qué hiciste hoy que la persona que quieres ser también habría hecho?",
    cita: { texto: "La disciplina es recordar lo que quieres por encima de lo que te apetece.", principio: "clear" },
    factIds: ["habits.streak.h1", "no.existe"],
    ...extra
  };
}

const CONTEXTO = { rasgos: new Set(["t1", "t2"]), hechos: new Set(["habits.streak.h1"]), previas: [] as string[] };

test("tokensSignificativos: minúsculas, sin acentos, sin puntuación ni palabras vacías", () => {
  assert.deepEqual(tokensSignificativos("¡Cumplo lo que me PROMETO, aunque nadie me mire!"), ["cumplo", "prometo", "aunque", "nadie", "mire"]);
});

test("similitud: Jaccard sobre tokens significativos", () => {
  assert.equal(similitud("Cumplo lo que me prometo", "cumplo lo que prometo"), 1);
  assert.equal(similitud("Ahorro para mi libertad", "Entreno cada mañana"), 0);
});

test("filtrarRepetidas: descarta las parecidas a días anteriores y las duplicadas entre sí", () => {
  const r = filtrarRepetidas(
    ["Cumplo lo que me prometo aunque nadie me mire", "Ahorro para comprar libertad", "Ahorro para comprar mi libertad"],
    ["Cumplo lo que me prometo, aunque nadie mire"]
  );
  assert.deepEqual(r.kept, ["Ahorro para comprar libertad"]);
  assert.equal(r.rejected.length, 2);
});

test("citaAtribuida: detecta autores y rayas de atribución", () => {
  assert.equal(citaAtribuida("El éxito es un hábito. — James Clear"), true);
  assert.equal(citaAtribuida("Como dijo Napoleon Hill, lo que la mente concibe..."), true);
  assert.equal(citaAtribuida("Robin Sharma lo resumió así"), true);
  assert.equal(citaAtribuida("Actúa desde el deseo cumplido, no desde la carencia."), false);
  // «clear» como palabra común no es un autor.
  assert.equal(citaAtribuida("Una meta clara vuelve clear el camino."), false);
});

test("sanearBrief: recorta, valida rasgos y hechos, y calcula la duración de la visualización", () => {
  const r = sanearBrief(crudo(), CONTEXTO);
  assert.equal(r.ok, true);
  assert.equal(r.brief!.affirmations.length, 5);
  assert.deepEqual(r.brief!.affirmations.map((a) => a.traitId), ["t1", "t2", null, null, "t1"]);
  assert.ok(r.brief!.affirmations.every((a, i) => a.id === `a${i + 1}`));
  assert.deepEqual(r.brief!.factIds, ["habits.streak.h1"]);
  assert.equal(r.brief!.visualization.durationMin, 3); // 180 s
  assert.equal(r.brief!.quote?.principle, "clear");
  assert.deepEqual(r.problemas, []);
});

test("sanearBrief: una visualización corta se estira al mínimo de 2 minutos repartiendo segundos", () => {
  const corta = crudo({ visualizacion: { titulo: "x", pasos: [{ texto: "Respira", segundos: 10 }, { texto: "Imagina", segundos: 10 }, { texto: "Vuelve", segundos: 10 }] } });
  const r = sanearBrief(corta, CONTEXTO);
  assert.equal(r.brief!.visualization.durationMin, 2);
  assert.equal(r.brief!.visualization.steps.reduce((s, p) => s + p.seconds, 0), 120);
});

test("sanearBrief: cita atribuida se descarta y se anota como problema", () => {
  const r = sanearBrief(crudo({ cita: { texto: "Lo que la mente concibe, lo logra. — Napoleon Hill", principio: "hill" } }), CONTEXTO);
  assert.equal(r.ok, true);
  assert.equal(r.brief!.quote, null);
  assert.ok(r.problemas.some((p) => p.includes("cita")));
});

test("sanearBrief: repetidas fuera; con menos de 3 afirmaciones no hay brief", () => {
  const previas = [
    "Cumplo lo que me prometo, aunque nadie me mire.",
    "Cada peso que ahorro compra mi libertad futura.",
    "Mi cuerpo responde a la disciplina que le doy cada mañana."
  ];
  const r = sanearBrief(crudo(), { ...CONTEXTO, previas });
  assert.equal(r.brief!.affirmations.length, 2);
  assert.equal(r.ok, false);
  assert.ok(r.problemas.some((p) => p.includes("repet")));
  assert.equal(r.rechazadas.length, 3);
});

test("sanearBrief: sin recordatorio o pregunta no hay brief", () => {
  assert.equal(sanearBrief(crudo({ recordatorio: "   " }), CONTEXTO).ok, false);
  assert.equal(sanearBrief(crudo({ pregunta: "" }), CONTEXTO).ok, false);
});
