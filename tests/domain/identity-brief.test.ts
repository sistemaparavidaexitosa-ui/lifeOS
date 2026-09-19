import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokensSignificativos,
  similitud,
  filtrarRepetidas,
  citaAtribuida,
  sanearBrief,
  sanearMantra,
  sanearAccionDelDia,
  LIMITES_AGENTE,
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

// ===========================================================================
// D-164 · Lo que el brief gana con el agente: límites parametrizados, mantra,
// acción del día, categorías y área de foco.
// ===========================================================================

/** Doce afirmaciones distintas entre sí, para ejercitar los límites del agente. */
function crudoAgente(extra: Partial<BriefCrudo> = {}): BriefCrudo {
  const afirmaciones = [
    { texto: "Cumplo lo que me prometo, aunque nadie me mire.", rasgoId: "t1", categoria: "Disciplina" },
    { texto: "Cada peso que ahorro compra libertad futura.", rasgoId: "t2", categoria: "Dinero" },
    { texto: "Mi cuerpo responde al entrenamiento que le doy.", rasgoId: "", categoria: "Salud" },
    { texto: "Termino un asunto antes de abrir otro distinto.", rasgoId: "", categoria: "Disciplina" },
    { texto: "Escucho antes de responder en cada reunión.", rasgoId: "t1", categoria: "Liderazgo" },
    { texto: "Cobro lo que vale mi trabajo sin disculparme.", rasgoId: "t2", categoria: "Negocio" },
    { texto: "Aprendo algo aplicable de cada libro que abro.", rasgoId: "", categoria: "Aprendizaje" },
    { texto: "Llego a casa presente, no solo de cuerpo.", rasgoId: "", categoria: "Relaciones" },
    { texto: "Sostengo la calma cuando el plan se tuerce.", rasgoId: "t1", categoria: "Confianza" },
    { texto: "Construyo algo que seguirá en pie sin mí.", rasgoId: "", categoria: "Propósito" },
    { texto: "Mi agenda refleja aquello que digo querer.", rasgoId: "t2", categoria: "Carrera" },
    { texto: "Doy gracias por lo que ya está funcionando.", rasgoId: "", categoria: "Espiritualidad" }
  ];
  /** El arco de nueve tiempos, que es lo que el tope de 8 pasos amputaba. */
  const pasos = [
    { texto: "Respira hondo tres veces y suelta los hombros.", segundos: 40 },
    { texto: "La habitación se queda en silencio a tu alrededor.", segundos: 30 },
    { texto: "Estás en tu oficina un martes de octubre del año que viene.", segundos: 40 },
    { texto: "Notas el peso de la taza caliente en la mano.", segundos: 35 },
    { texto: "Tu socio te dice que el trimestre cerró por encima del plan.", segundos: 40 },
    { texto: "Miras la cifra en la pantalla y es la que escribiste hace un año.", segundos: 35 },
    { texto: "Sientes el orgullo tranquilo de quien ya no tiene que demostrarlo.", segundos: 35 },
    { texto: "Agradeces las mañanas en las que no te apetecía y fuiste igual.", segundos: 30 },
    { texto: "Vuelves a esta habitación con esa certeza puesta.", segundos: 30 }
  ];
  return { ...crudo(), afirmaciones, visualizacion: { titulo: "El martes de octubre", pasos }, ...extra };
}

test("citaAtribuida: Dispenza entra con el mismo cambio que lo hace elegible", () => {
  assert.equal(citaAtribuida("La mente crea la realidad. — Joe Dispenza"), true);
  assert.equal(citaAtribuida("Como enseña Dispenza, el cuerpo aprende antes que la mente"), true);
});

test("LIMITES_AGENTE: los nueve tiempos sobreviven y la escena llega a cinco minutos", () => {
  const r = sanearBrief(crudoAgente(), CONTEXTO, LIMITES_AGENTE);
  assert.equal(r.ok, true);
  // Con LIMITES_RESPALDO (slice(0,8)) se perdían gratitud y regreso.
  assert.equal(r.brief!.visualization.steps.length, 9);
  assert.match(r.brief!.visualization.steps[8]!.text, /Vuelves a esta habitación/);
  const total = r.brief!.visualization.steps.reduce((s, p) => s + p.seconds, 0);
  assert.ok(total >= 240 && total <= 420, `la escena dura ${total} s, fuera de 240-420`);
  assert.equal(r.brief!.visualization.durationMin, 5);
});

test("LIMITES_AGENTE: doce afirmaciones con ids a1..a12 y su categoría", () => {
  const r = sanearBrief(crudoAgente(), CONTEXTO, LIMITES_AGENTE);
  assert.equal(r.brief!.affirmations.length, 12);
  assert.equal(r.brief!.affirmations[11]!.id, "a12");
  assert.equal(r.brief!.affirmations[0]!.category, "Disciplina");
  assert.equal(r.brief!.affirmations[1]!.category, "Dinero");
  // Doce está dentro de 10-20: es un brief legítimo, no un reintento.
  assert.deepEqual(r.problemas, []);
});

test("LIMITES_AGENTE: con nueve afirmaciones se pide un reintento, pero el brief se sostiene", () => {
  const corto = crudoAgente();
  corto.afirmaciones = corto.afirmaciones.slice(0, 9);
  const r = sanearBrief(corto, CONTEXTO, LIMITES_AGENTE);
  assert.equal(r.ok, false, "nueve está por debajo del mínimo del agente");
  assert.ok(r.problemas.some((p) => p.includes("Faltan afirmaciones")));
});

test("una escena que se pasa de largo se reescala sin perder ningún paso", () => {
  const largo = crudoAgente();
  largo.visualizacion.pasos = largo.visualizacion.pasos.map((p) => ({ ...p, segundos: 90 }));
  const r = sanearBrief(largo, CONTEXTO, LIMITES_AGENTE);
  assert.equal(r.brief!.visualization.steps.length, 9, "reescalar no es recortar");
  const total = r.brief!.visualization.steps.reduce((s, p) => s + p.seconds, 0);
  assert.equal(total, 420);
});

test("una categoría desconocida no tumba la afirmación: la deja sin etiqueta", () => {
  const raro = crudoAgente();
  raro.afirmaciones[0] = { ...raro.afirmaciones[0]!, categoria: "Productividad" };
  const r = sanearBrief(raro, CONTEXTO, LIMITES_AGENTE);
  assert.equal(r.brief!.affirmations.length, 12);
  assert.equal(r.brief!.affirmations[0]!.category, null);
  assert.deepEqual(r.problemas, [], "una etiqueta de más no merece un reintento");
});

test("sanearMantra: una frase de hasta veinte palabras; lo demás se descarta, no se recorta", () => {
  assert.equal(sanearMantra("Hoy elijo la versión de mí que no negocia sus mañanas").mantra, "Hoy elijo la versión de mí que no negocia sus mañanas");
  assert.equal(sanearMantra(undefined).mantra, null);
  assert.equal(sanearMantra(undefined).problema, null, "el respaldo no escribe mantra y eso no es un fallo");

  const largo = sanearMantra("Uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno");
  assert.equal(largo.mantra, null);
  assert.match(largo.problema!, /21 palabras/);

  // Cortarlo a la mitad con puntos suspensivos no daría un mantra corto: daría
  // basura que alguien se repetiría en voz alta.
  const dos = sanearMantra("Hoy cumplo lo que prometo. Mañana también lo haré.");
  assert.equal(dos.mantra, null);
  assert.match(dos.problema!, /UNA sola frase/);

  // Un punto final bien puesto no es dos frases.
  assert.equal(sanearMantra("Hoy cumplo lo que me prometo.").mantra, "Hoy cumplo lo que me prometo.");
});

test("sanearAccionDelDia: rechaza el estado de ánimo, acepta lo que se puede terminar hoy", () => {
  const ctx = { rasgos: new Set(["t1"]) };

  const buena = sanearAccionDelDia({ texto: "Llama al cliente de Monterrey antes de las 11", rasgoId: "t1", area: "Carrera" }, ctx);
  assert.equal(buena.accion!.text, "Llama al cliente de Monterrey antes de las 11");
  assert.equal(buena.accion!.traitId, "t1");
  assert.equal(buena.accion!.area, "Carrera");
  assert.equal(buena.problema, null);

  for (const vaga of ["Sé más constante con tus cosas", "Intenta cuidarte un poco más", "Recuerda que eres capaz de lograrlo"]) {
    const r = sanearAccionDelDia({ texto: vaga }, ctx);
    assert.equal(r.accion, null, `«${vaga}» debería rechazarse`);
    assert.match(r.problema!, /estado de ánimo/);
  }

  assert.equal(sanearAccionDelDia({ texto: "Entrena" }, ctx).accion, null, "una palabra no es una acción");
  assert.equal(sanearAccionDelDia(undefined, ctx).accion, null);
  assert.equal(sanearAccionDelDia(undefined, ctx).problema, null);

  // Un rasgo que no existe se cae, igual que en las afirmaciones.
  assert.equal(sanearAccionDelDia({ texto: "Revisa el flujo de caja del trimestre", rasgoId: "inventado" }, ctx).accion!.traitId, null);
});

test("un área de foco inventada se cae sin provocar un reintento", () => {
  const r = sanearBrief(crudoAgente({ focusArea: "Productividad" }), CONTEXTO, LIMITES_AGENTE);
  assert.equal(r.brief!.focusArea, null);
  assert.deepEqual(r.problemas, []);
  assert.equal(sanearBrief(crudoAgente({ focusArea: "finanzas" }), CONTEXTO, LIMITES_AGENTE).brief!.focusArea, "Finanzas");
});

test("el respaldo sigue sin mantra, sin acción y sin foco, y eso es un brief válido", () => {
  const r = sanearBrief(crudo(), CONTEXTO);
  assert.equal(r.ok, true);
  assert.equal(r.brief!.mantra, null);
  assert.equal(r.brief!.dailyAction, null);
  assert.equal(r.brief!.focusArea, null);
  assert.equal(r.brief!.affirmations.length, 5);
  assert.equal(r.brief!.affirmations[0]!.category, null);
});
