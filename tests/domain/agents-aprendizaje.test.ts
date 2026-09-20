import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UMBRALES_DECISION,
  enRechazoSostenido,
  leccionesParaElPrompt,
  libroDeDecisiones,
  type DecisionTomada
} from "../../src/lib/domain/agents/aprendizaje.ts";

// Se aprende de la DECISIÓN, no del contenido (D-174). Las tres salvaguardas
// —corte por revisión de identidad, contrafactual obligatorio y caducidad
// automática— son el producto, no la estadística, y cada una tiene su prueba.

/** n decisiones, una por día consecutivo desde el 1 de enero. */
function decisiones(
  spec: { tipo: string; status: "accepted" | "dismissed"; n: number; agenteId?: string }[],
  desdeDia = 1
): DecisionTomada[] {
  const salida: DecisionTomada[] = [];
  let dia = desdeDia;
  for (const s of spec) {
    for (let i = 0; i < s.n; i++) {
      salida.push({
        agenteId: s.agenteId ?? "coach-diario",
        tipo: s.tipo,
        status: s.status,
        decididaEl: `2026-01-${String(dia).padStart(2, "0")}`
      });
      dia++;
    }
  }
  return salida;
}

test("con pocos días no se afirma NADA, y lo dice", () => {
  const libro = libroDeDecisiones(decisiones([{ tipo: "rutina", status: "dismissed", n: 5 }]));

  assert.deepEqual(libro.lecciones, []);
  assert.match(libro.motivo ?? "", /suficientes días/);
});

test("aprende que un tipo se descarta mucho más que el resto", () => {
  const libro = libroDeDecisiones(
    decisiones([
      { tipo: "rutina", status: "dismissed", n: 8 },
      { tipo: "tarea", status: "accepted", n: 8 }
    ])
  );

  const rutina = libro.lecciones.find((l) => l.tipo === "rutina");
  assert.equal(rutina?.veredicto, "evitar");
  assert.ok(rutina && rutina.lift < 0, "el lift de lo que se descarta es negativo");
});

test("aprende también lo que sí funciona", () => {
  const libro = libroDeDecisiones(
    decisiones([
      { tipo: "tarea", status: "accepted", n: 8 },
      { tipo: "meta", status: "dismissed", n: 8 }
    ])
  );

  assert.equal(libro.lecciones.find((l) => l.tipo === "tarea")?.veredicto, "preferir");
});

// SALVAGUARDA 2. Si el agente solo propone rutinas, «rechaza las rutinas» no
// significa nada: significa «rechaza lo que le llega».
test("sin contrafactual no hay lección, por mucho rechazo que haya", () => {
  const libro = libroDeDecisiones(decisiones([{ tipo: "rutina", status: "dismissed", n: 20 }]));

  assert.deepEqual(libro.lecciones, []);
});

// SALVAGUARDA 1. Sin esto, el sistema sabotearía en junio a quien cambió de
// rumbo en enero.
test("lo decidido antes de revisar la identidad no cuenta", () => {
  const antiguas = decisiones([
    { tipo: "rutina", status: "dismissed", n: 8 },
    { tipo: "tarea", status: "accepted", n: 8 }
  ]);

  const sinCorte = libroDeDecisiones(antiguas);
  const conCorte = libroDeDecisiones(antiguas, { desdeLaRevision: "2026-02-01" });

  assert.ok(sinCorte.lecciones.length > 0);
  assert.deepEqual(conCorte.lecciones, [], "tras revisar la identidad se empieza de cero");
  assert.equal(conCorte.dias, 0);
});

test("como mucho tres lecciones, las más marcadas primero", () => {
  const libro = libroDeDecisiones(
    decisiones([
      { tipo: "a", status: "dismissed", n: 8 },
      { tipo: "b", status: "dismissed", n: 8 },
      { tipo: "c", status: "dismissed", n: 8 },
      { tipo: "d", status: "dismissed", n: 8 },
      { tipo: "e", status: "accepted", n: 8 }
    ])
  );

  assert.ok(libro.lecciones.length <= UMBRALES_DECISION.maxLecciones);
  const lifts = libro.lecciones.map((l) => Math.abs(l.lift));
  assert.deepEqual(lifts, [...lifts].sort((a, b) => b - a));
});

// Una corazonada obedecida es una corazonada convertida en política.
test("las lecciones de confianza baja no llegan al prompt", () => {
  const libro = libroDeDecisiones(
    decisiones([
      { tipo: "rutina", status: "dismissed", n: 7 },
      { tipo: "tarea", status: "accepted", n: 7 }
    ])
  );

  const baja = libro.lecciones.filter((l) => l.confianza === "baja");
  const frases = leccionesParaElPrompt(libro);

  for (const l of baja) {
    assert.ok(!frases.some((f) => f.includes(l.tipo)), `no debería pintarse «${l.tipo}»`);
  }
});

// --- El rechazo sostenido, y su caducidad ---

test("un agente al que no se le acepta nada se calla", () => {
  const datos = decisiones([
    { tipo: "rutina", status: "dismissed", n: 8, agenteId: "coach-diario" },
    { tipo: "tarea", status: "accepted", n: 8, agenteId: "otro-agente" }
  ]);

  assert.equal(enRechazoSostenido(datos, "coach-diario"), true);
  assert.equal(enRechazoSostenido(datos, "otro-agente"), false);
});

test("un agente nuevo no se castiga por serlo", () => {
  const datos = decisiones([
    { tipo: "rutina", status: "dismissed", n: 3, agenteId: "recien-llegado" },
    { tipo: "tarea", status: "accepted", n: 15, agenteId: "otro-agente" }
  ]);

  assert.equal(enRechazoSostenido(datos, "recien-llegado"), false);
});

test("sin otros agentes con los que comparar, nadie se calla", () => {
  const datos = decisiones([{ tipo: "rutina", status: "dismissed", n: 20, agenteId: "solo" }]);

  assert.equal(enRechazoSostenido(datos, "solo"), false);
});

// LA PRUEBA QUE PROTEGE EL PRINCIPIO. Un agente silenciado deja de generar
// decisiones; sus datos envejecen y la lección se cae SOLA. Si alguien
// "arregla" esto para que el silencio persista, habrá construido una jaula.
test("SE CAE SOLA: sin datos nuevos, el agente vuelve a hablar", () => {
  const castigado = decisiones([
    { tipo: "rutina", status: "dismissed", n: 8, agenteId: "coach-diario" },
    { tipo: "tarea", status: "accepted", n: 8, agenteId: "otro-agente" }
  ]);
  assert.equal(enRechazoSostenido(castigado, "coach-diario"), true);

  // Pasa el tiempo: el agente calló, no hubo decisiones suyas, y al acotar la
  // ventana solo quedan las de los demás. Nadie tuvo que reactivarlo.
  const despues = castigado.filter((d) => d.agenteId !== "coach-diario");
  assert.equal(enRechazoSostenido(despues, "coach-diario"), false);
});

test("una revisión de identidad también devuelve la voz al agente", () => {
  const datos = decisiones([
    { tipo: "rutina", status: "dismissed", n: 8, agenteId: "coach-diario" },
    { tipo: "tarea", status: "accepted", n: 8, agenteId: "otro-agente" }
  ]);

  assert.equal(enRechazoSostenido(datos, "coach-diario"), true);
  assert.equal(
    enRechazoSostenido(datos, "coach-diario", { desdeLaRevision: "2026-02-01" }),
    false,
    "quien cambió de rumbo merece que el sistema deje de castigarlo por el rumbo viejo"
  );
});
