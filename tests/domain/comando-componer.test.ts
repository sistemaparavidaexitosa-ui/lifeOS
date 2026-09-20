import { test } from "node:test";
import assert from "node:assert/strict";
import { componerMando, type EntradaDeMando } from "../../src/lib/domain/comando/componer.ts";
import { tarjetasDelCentro } from "../../src/lib/domain/centro/lienzo.ts";
import { CATEGORIAS } from "../../src/lib/domain/comando/tipos.ts";

// El centro de mando (D-176). Lo que se prueba aquí NO es la priorización —eso
// ya lo cubren los catorce casos de `centro-lienzo.test.ts`— sino que este
// archivo **no la reescribe**: que reparte lo que `tarjetasDelCentro` devuelve
// y que la reparte en el sitio correcto.

function entrada(extra: Partial<EntradaDeMando> = {}): EntradaDeMando {
  return {
    resumen: "",
    proximoHabito: null,
    propuestas: [],
    unicaCosa: null,
    vencidas: 0,
    diasParaFinDeQuincena: 10,
    presupuestoEnRojo: false,
    planAprobado: false,
    saturacion: "ok",
    minutosComprometidos: 0,
    minutosDisponibles: 480,
    ...extra
  };
}

const propuesta = (id: string, tipo: string) => ({
  id,
  tipo,
  titulo: `Propuesta ${id}`,
  motivo: "porque sí",
  href: null
});

// LA PRUEBA QUE SOSTIENE EL DISEÑO. Si algún día esto falla, alguien escribió
// un segundo criterio de prioridad y el centro dejó de ser una cara de D-169.
test("NO REORDENA: respeta el orden de tarjetasDelCentro", () => {
  const e = entrada({
    resumen: "Vas bien",
    unicaCosa: "Cerrar el rediseño",
    vencidas: 2,
    propuestas: [propuesta("p1", "tarea")]
  });

  const esperado = tarjetasDelCentro(e, []).filter((t) => t.kind !== "cierre").map((t) => t.id);
  const m = componerMando(e);
  const obtenido = [m.foco, ...m.siguientes, ...m.bloqueos].filter(Boolean).map((i) => i!.id);

  assert.deepEqual([...obtenido].sort(), [...esperado].sort(), "no puede aparecer ni desaparecer nada");
  // Y dentro de cada sección, el orden relativo se conserva.
  const soloResto = esperado.filter((id) => !m.bloqueos.some((b) => b.id === id));
  assert.deepEqual([m.foco?.id, ...m.siguientes.map((s) => s.id)].filter(Boolean), soloResto);
});

test("el día vacío no miente: sin foco, sin bloqueos, con cierre", () => {
  const m = componerMando(entrada());

  assert.equal(m.foco, null);
  assert.deepEqual(m.bloqueos, []);
  assert.deepEqual(m.siguientes, []);
  assert.ok(m.cierre.length > 0, "siempre hay algo honesto que decir");
});

// Si los bloqueos pudieran ser el foco, un día con dos vencidas te diría que tu
// única prioridad es ponerte al día — lo contrario de avanzar.
test("los bloqueos NUNCA ocupan el foco", () => {
  const m = componerMando(entrada({ vencidas: 3, unicaCosa: "Cerrar el rediseño" }));

  assert.equal(m.foco?.categoria !== "bloquear", true);
  assert.equal(m.foco?.titulo.includes("rediseño"), true);
  assert.equal(m.bloqueos.length, 1);
  assert.equal(m.bloqueos[0]?.categoria, "bloquear");
});

test("sin bloqueos la sección queda vacía, para que no se pinte", () => {
  const m = componerMando(entrada({ unicaCosa: "Algo" }));

  assert.deepEqual(m.bloqueos, []);
  assert.equal(m.estado.bloqueos, 0);
});

// --- Las categorías ---

test("las vencidas frenan; el hábito y la Única Cosa se ejecutan", () => {
  const conVencidas = componerMando(entrada({ vencidas: 1 }));
  assert.equal(conVencidas.bloqueos[0]?.categoria, "bloquear");

  const conUnica = componerMando(entrada({ unicaCosa: "Algo" }));
  assert.equal(conUnica.foco?.categoria, "ejecutar");
});

// El dinero es el caso interesante: en rojo deja de ser algo que revisar.
test("el dinero cambia de categoría según el estado, no según el tipo", () => {
  const cerca = componerMando(entrada({ diasParaFinDeQuincena: 1 }));
  assert.equal(cerca.foco?.categoria, "revisar");
  assert.deepEqual(cerca.bloqueos, []);

  const enRojo = componerMando(entrada({ presupuestoEnRojo: true }));
  assert.equal(enRojo.bloqueos[0]?.categoria, "bloquear");
});

test("una meta se decide, una tarea se ejecuta, una nota se recuerda", () => {
  const cat = (tipo: string) => {
    const m = componerMando(entrada({ propuestas: [propuesta("p1", tipo)] }));
    return [m.foco, ...m.siguientes].find((i) => i?.id === "propuesta:p1")?.categoria;
  };

  assert.equal(cat("tarea"), "ejecutar");
  assert.equal(cat("bloque"), "ejecutar");
  assert.equal(cat("meta"), "decidir");
  assert.equal(cat("estructura"), "decidir");
  assert.equal(cat("arista"), "decidir");
  assert.equal(cat("nota"), "recordar");
});

// Un tipo nuevo en la base no puede dejar un hueco sin categoría: pedir que
// hagas algo que había que decidir molesta menos que quedarse en blanco.
test("un tipo que la base gane mañana cae en ejecutar, no revienta", () => {
  const m = componerMando(entrada({ propuestas: [propuesta("p1", "inventado")] }));

  assert.equal([m.foco, ...m.siguientes].find((i) => i?.id === "propuesta:p1")?.categoria, "ejecutar");
});

test("toda categoría emitida es una de las siete", () => {
  const m = componerMando(
    entrada({
      resumen: "Vas bien",
      unicaCosa: "Algo",
      vencidas: 1,
      presupuestoEnRojo: true,
      propuestas: [propuesta("p1", "meta"), propuesta("p2", "nota")]
    })
  );

  for (const i of [m.foco, ...m.siguientes, ...m.bloqueos].filter(Boolean)) {
    assert.ok((CATEGORIAS as readonly string[]).includes(i!.categoria), `categoría suelta: ${i!.categoria}`);
  }
});

// --- El estado de la cabecera ---

test("el estado son datos, no acciones: nunca produce un ítem", () => {
  const m = componerMando(entrada({ saturacion: "saturated", minutosComprometidos: 390, planAprobado: true }));

  assert.equal(m.estado.saturacion, "saturated");
  assert.equal(m.estado.horasComprometidas, 6.5);
  assert.equal(m.estado.planAprobado, true);
  // Ni la saturación ni el plan aprobado se cuelan como cosas que hacer.
  assert.equal(m.foco, null);
  assert.deepEqual(m.siguientes, []);
});

test("el resumen vacío se queda vacío: no se inventa uno", () => {
  assert.equal(componerMando(entrada()).estado.resumen, "");
  assert.equal(componerMando(entrada({ resumen: "Vas bien" })).estado.resumen, "Vas bien");
});

// Apartar algo no lo borra: la regla de D-169 se conserva entera.
test("«ahora no» baja el ítem, no lo hace desaparecer", () => {
  const e = entrada({ unicaCosa: "Algo", propuestas: [propuesta("p1", "tarea")] });

  const antes = componerMando(e);
  const despues = componerMando(e, [antes.foco!.id]);

  const idsAntes = [antes.foco, ...antes.siguientes].map((i) => i!.id).sort();
  const idsDespues = [despues.foco, ...despues.siguientes].map((i) => i!.id).sort();

  assert.deepEqual(idsDespues, idsAntes, "sigue estando");
  assert.notEqual(despues.foco?.id, antes.foco?.id, "pero ya no manda");
});

// --- Lo que la UI necesita para actuar sin volver a deducirlo ---

test("cada ítem lleva lo justo para resolverse", () => {
  const m = componerMando(
    entrada({
      propuestas: [propuesta("p1", "tarea")],
      unicaCosa: "Algo",
      vencidas: 1
    })
  );
  const todos = [m.foco, ...m.siguientes, ...m.bloqueos].filter(Boolean);

  const prop = todos.find((i) => i!.datos.tipo === "propuesta");
  assert.equal(prop?.datos.tipo === "propuesta" && prop.datos.propuestaId, "p1");

  const vencidas = m.bloqueos[0];
  assert.equal(vencidas?.datos.tipo, "navegar");
  assert.ok(vencidas?.href, "lo que navega tiene a dónde ir");
  assert.ok(vencidas?.accion, "y qué poner en el botón");
});
