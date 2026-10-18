import { test } from "node:test";
import assert from "node:assert/strict";
import { analizar, type Analisis } from "../../src/lib/domain/centro/interprete/analizar.ts";
import { pideCriterio, destinoDe } from "../../src/lib/domain/centro/interprete/vocabulario.ts";

const H = "2026-10-18";

/** Solo las claves que el caso mira. */
function pick(a: Analisis, claves: string[]): Record<string, unknown> {
  const o = a as unknown as Record<string, unknown>;
  return Object.fromEntries(claves.filter((k) => k in o).map((k) => [k, o[k]]));
}

test("Crear tarea: verbo, tabla, fecha, prioridad, proyecto mencionado y título", () => {
  const texto = "Crea una tarea llamar a Juan mañana en el proyecto Rediseño, urgente";
  assert.deepEqual(analizar(texto, H), {
    tipo: "escribir",
    operacion: "crear",
    tabla: "tasks",
    valores: { due: "2026-10-19", priority: "High" },
    menciones: { project_id: "rediseno" },
    resto: "llamar a juan",
    textoOriginal: texto,
    elegida: null
  });
});

test("Crear tarea: «nueva tarea» y el título entre comillas manda", () => {
  const a = analizar("nueva tarea «Reunión del lunes» para el viernes", H);
  assert.deepEqual(pick(a, ["tipo", "operacion", "tabla", "valores", "resto"]), {
    tipo: "escribir",
    operacion: "crear",
    tabla: "tasks",
    valores: { due: "2026-10-23" },
    resto: "Reunión del lunes"
  });
});

test("Crear nota en un cuaderno mencionado", () => {
  assert.deepEqual(pick(analizar("nueva nota: reunión con Ana en el cuaderno Trabajo", H), ["tabla", "resto", "menciones"]), {
    tabla: "notes",
    resto: "reunion con ana",
    menciones: { notebook_id: "trabajo" }
  });
});

test("Comida: el verbo trae tabla y comida; los gramos salen del texto", () => {
  assert.deepEqual(pick(analizar("desayuné 80 g de avena", H), ["tabla", "operacion", "valores", "resto"]), {
    tabla: "food_entries",
    operacion: "crear",
    valores: { meal: "Desayuno", grams: 80 },
    resto: "avena"
  });
  assert.deepEqual(pick(analizar("ayer cené 200 gramos de pollo", H), ["valores", "resto"]), {
    valores: { meal: "Cena", grams: 200, local_date: "2026-10-17" },
    resto: "pollo"
  });
});

test("Editar: marcar como hecha una tarea por su nombre", () => {
  assert.deepEqual(pick(analizar("marca como hecha la tarea llamar a Juan", H), ["operacion", "tabla", "valores", "resto"]), {
    operacion: "editar",
    tabla: "tasks",
    valores: { status: "Completed" },
    resto: "llamar a juan"
  });
  assert.deepEqual(pick(analizar("termina la tarea pagar luz", H), ["operacion", "valores", "resto"]), {
    operacion: "editar",
    valores: { status: "Completed" },
    resto: "pagar luz"
  });
  assert.deepEqual(pick(analizar("pospón la tarea pagar luz al lunes", H), ["operacion", "valores", "resto"]), {
    operacion: "editar",
    valores: { due: "2026-10-19" },
    resto: "pagar luz"
  });
});

test("Borrar: una nota por su nombre", () => {
  assert.deepEqual(pick(analizar("borra la nota reunión con Ana", H), ["operacion", "tabla", "resto"]), {
    operacion: "borrar",
    tabla: "notes",
    resto: "reunion con ana"
  });
});

test("Lo que pide criterio va a la IA", () => {
  for (const t of ["¿cómo voy con mis gastos?", "recomiéndame qué leer", "analiza mi semana", "por qué no avanzo", "cuánto gasté en comida", "qué hago hoy"]) {
    assert.equal(analizar(t, H).tipo, "ia", t);
  }
});

test("Lo que viene de las tarjetas de la IA, o es demasiado largo, va a la IA", () => {
  assert.equal(analizar("Sí, sigue: crear la tarea X", H).tipo, "ia");
  assert.equal(analizar("No era eso (Crear · Tarea: X)", H).tipo, "ia");
  assert.equal(analizar("crea una tarea " + "x".repeat(300), H).tipo, "ia");
});

test("Ante la duda, IA: sin verbo, sin tabla, dos tablas o el verbo lejos del inicio", () => {
  assert.equal(analizar("hola", H).tipo, "ia");
  assert.equal(analizar("crea algo", H).tipo, "ia");
  assert.equal(analizar("anótame que tengo que llamar", H).tipo, "ia");
  assert.equal(analizar('anota «Comprar café» en el cuaderno Ideas', H).tipo, "ia");
  assert.equal(analizar("crea una tarea y una nota", H).tipo, "ia");
  assert.equal(analizar("la tarea de ayer crea problemas", H).tipo, "ia");
});

test("Navegar: verbo de ir + una sección", () => {
  assert.deepEqual(analizar("llévame a presupuesto", H), { tipo: "navegar", destino: { href: "/money/budget", etiqueta: "Presupuesto" } });
  assert.equal(destinoDe("abre mis habitos")?.href, "/development/routines");
  assert.equal(destinoDe("abre la pantalla de deudas")?.href, "/debt");
  assert.equal(destinoDe("presupuesto"), null);
  assert.equal(destinoDe("abre mis tareas de hoy"), null);
});

test("pideCriterio: una pregunta con ¿ o ? siempre lo es", () => {
  assert.equal(pideCriterio("¿crea una tarea?", "crea una tarea"), true);
  assert.equal(pideCriterio("crea una tarea", "crea una tarea"), false);
});

test("La marca #<uuid> del final elige fila y no entra en el título", () => {
  const id = "44444442-4444-4444-8444-444444444444";
  const a = analizar(`borra la tarea «Llamar a Juan» #${id}`, H);
  assert.equal(a.tipo === "escribir" && a.elegida, id);
  assert.equal(a.tipo === "escribir" && a.resto, "Llamar a Juan");
  const b = analizar("borra la tarea llamar a Juan", H);
  assert.equal(b.tipo === "escribir" && b.elegida, null);
});
