import { test } from "node:test";
import assert from "node:assert/strict";
import { componerMando, type EntradaDeMando } from "../../src/lib/domain/comando/componer.ts";
import { tarjetasDelCentro } from "../../src/lib/domain/centro/lienzo.ts";
import { CARRILES, CATEGORIAS } from "../../src/lib/domain/comando/tipos.ts";

// La capa de navegación del Centro (D-177). Lo que se prueba NO es la
// priorización —eso son los catorce casos de `centro-lienzo.test.ts`— sino que
// este archivo **no la reescribe**: que reparte en tres frentes lo que
// `tarjetasDelCentro` devuelve, y que un frente en calma dice algo verdadero
// en vez de callarse.

function entrada(extra: Partial<EntradaDeMando> = {}): EntradaDeMando {
  return {
    resumen: "",
    proximoHabito: null,
    propuestas: [],
    unicaCosa: null,
    vencidas: 0,
    diasParaFinDeQuincena: 10,
    presupuestoEnRojo: false,
    senalesDeCarril: { tareasDelPlan: 0, habitosPendientes: 0, identidadDeclarada: true },
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

const habito = {
  routineId: "r1",
  routineName: "Mañana",
  habitId: "h1",
  nombre: "Leer 20 minutos",
  durationMin: 20
};

/** El primer ítem de ese frente en la lista, que es lo que subiría al pasar. */
const via = (m: ReturnType<typeof componerMando>, c: (typeof CARRILES)[number]) => ({
  ...m.frentes.find((f) => f.carril === c)!,
  // Después del spread: `CarrilDelCentro.item` es siempre null en `frentes`
  // —solo describen el cierre— y pisaría al que de verdad buscamos.
  item: m.items.find((i) => i.carril === c) ?? null
});

// LA PRUEBA QUE SOSTIENE EL DISEÑO. Si falla, alguien escribió un segundo
// criterio de prioridad y el Centro dejó de ser una cara de D-169.
test("NO REORDENA: dentro de un carril manda el orden de tarjetasDelCentro", () => {
  const e = entrada({
    unicaCosa: "Cerrar el rediseño",
    vencidas: 2,
    propuestas: [propuesta("p1", "tarea")]
  });

  // Los tres de ejecución compiten entre sí; gana el primero que devuelva el
  // lienzo, no el que a esta capa le parezca.
  const orden = tarjetasDelCentro(e, [])
    .filter((t) => t.kind !== "cierre" && t.kind !== "apertura")
    .map((t) => t.id);

  // La lista es EXACTAMENTE la del lienzo, sin reordenar ni agrupar.
  assert.deepEqual(componerMando(e).items.map((i) => i.id), orden);
});

test("el cierre ofrece siempre los tres frentes, en su orden", () => {
  const m = componerMando(entrada());

  assert.deepEqual(m.frentes.map((f) => f.carril), [...CARRILES]);
});

// D-180: se enseña de uno en uno. Si algún día esto devuelve los tres a la vez,
// el Centro volvió a ser el panel que satura.
test("UNA COSA A LA VEZ: los ítems son una lista, no tres grupos", () => {
  const m = componerMando(entrada({ unicaCosa: "Algo", presupuestoEnRojo: true, proximoHabito: habito }));

  assert.ok(Array.isArray(m.items));
  assert.ok(m.items.length >= 3, "los tres frentes conviven en la lista");
  // Y ninguno de los frentes del cierre lleva ítem: el cierre solo navega.
  for (const f of m.frentes) assert.equal(f.item, null);
});

// Esconder el frente que va bien deja a la persona sin saber si es que no hay
// nada o es que no se miró.
test("en el cierre, cada frente dice qué sabe y deja entrar", () => {
  const m = componerMando(
    entrada({ senalesDeCarril: { tareasDelPlan: 3, habitosPendientes: 0, identidadDeclarada: true } })
  );

  assert.deepEqual(m.items, [], "sin nada pendiente no hay paso que enseñar");
  for (const v of m.frentes) {
    assert.ok(v.estado.length > 0, `${v.carril} se quedó mudo`);
    assert.ok(v.href.length > 0, `${v.carril} no lleva a ningún sitio`);
    assert.ok(v.destino.length > 0, `${v.carril} no dice cómo entrar`);
  }
  assert.match(via(m, "execution").estado, /3 tareas/);
});

test("sin identidad declarada, el carril de desarrollo lo dice", () => {
  const m = componerMando(
    entrada({ senalesDeCarril: { tareasDelPlan: 0, habitosPendientes: 0, identidadDeclarada: false } })
  );

  assert.match(via(m, "development").estado, /quién quieres convertirte/);
});

test("el día sin nada no inventa trabajo", () => {
  const m = componerMando(entrada());

  assert.deepEqual(m.items, []);
  assert.ok(m.cierre.length > 0);
  assert.equal(m.estado.bloqueos, 0);
});

// --- El reparto en frentes ---

test("cada cosa cae en su frente", () => {
  const m = componerMando(
    entrada({
      unicaCosa: "Cerrar el rediseño",
      vencidas: 2,
      presupuestoEnRojo: true,
      proximoHabito: habito
    })
  );

  // El hábito es desarrollo personal aunque se marque en dos segundos: lo que
  // mueve es el voto por el rasgo, no la tarea.
  assert.equal(via(m, "development").item?.datos.tipo, "habito");
  assert.equal(via(m, "money").item?.id, "dinero");
  assert.ok(["unica", "vencidas"].includes(via(m, "execution").item?.id ?? ""));
});

test("las propuestas van al frente donde vive lo que proponen", () => {
  const carrilDe = (tipo: string) => {
    const m = componerMando(entrada({ propuestas: [propuesta("p1", tipo)] }));
    return m.items.find((i) => i.id === "propuesta:p1")?.carril;
  };

  assert.equal(carrilDe("tarea"), "execution");
  assert.equal(carrilDe("bloque"), "execution");
  assert.equal(carrilDe("estructura"), "execution");
  assert.equal(carrilDe("arista"), "execution");
  assert.equal(carrilDe("rutina"), "development");
  assert.equal(carrilDe("meta"), "development");
});

test("un tipo que la base gane mañana cae en ejecución, no revienta", () => {
  const m = componerMando(entrada({ propuestas: [propuesta("p1", "inventado")] }));

  assert.equal(via(m, "execution").item?.id, "propuesta:p1");
});

// --- Quién manda ---

test("el primero de la lista es el que más aprieta, sea del frente que sea", () => {
  assert.equal(componerMando(entrada({ presupuestoEnRojo: true })).items[0]?.carril, "money");
  assert.equal(componerMando(entrada({ proximoHabito: habito })).items[0]?.carril, "development");
});

// --- Categorías, que siguen valiendo ---

test("el dinero cambia de categoría según el estado, no según el tipo", () => {
  assert.equal(via(componerMando(entrada({ diasParaFinDeQuincena: 1 })), "money").item?.categoria, "revisar");
  assert.equal(via(componerMando(entrada({ presupuestoEnRojo: true })), "money").item?.categoria, "bloquear");
});

test("toda categoría emitida es una de las siete", () => {
  const m = componerMando(
    entrada({
      unicaCosa: "Algo",
      vencidas: 1,
      presupuestoEnRojo: true,
      proximoHabito: habito,
      propuestas: [propuesta("p1", "meta")]
    })
  );

  for (const i of m.items) {
    assert.ok((CATEGORIAS as readonly string[]).includes(i.categoria), `categoría suelta: ${i.categoria}`);
  }
});

test("los bloqueos se cuentan aunque estén repartidos", () => {
  const m = componerMando(entrada({ vencidas: 2, presupuestoEnRojo: true }));

  assert.equal(m.estado.bloqueos, 2, "las vencidas y el dinero en rojo frenan, cada uno en su frente");
});

// --- Lo que sobrevive de D-169 ---

test("«ahora no» aparta dentro del carril, no borra", () => {
  const e = entrada({ unicaCosa: "Algo", vencidas: 1 });
  const antes = componerMando(e);
  const apartado = antes.items[0]!.id;

  const despues = componerMando(e, [apartado]);

  assert.ok(despues.items.some((i) => i.id === apartado), "sigue en la lista: apartar no es borrar");
  assert.notEqual(despues.items[0]?.id, apartado, "pero ya no es el primero");
});

test("el resumen vacío se queda vacío: no se inventa uno", () => {
  assert.equal(componerMando(entrada()).estado.resumen, "");
  assert.equal(componerMando(entrada({ resumen: "Vas bien" })).estado.resumen, "Vas bien");
});

test("cada ítem lleva lo justo para resolverse sin salir del centro", () => {
  const m = componerMando(entrada({ propuestas: [propuesta("p1", "tarea")], presupuestoEnRojo: true }));

  const prop = via(m, "execution").item;
  assert.equal(prop?.datos.tipo === "propuesta" && prop.datos.propuestaId, "p1");

  const dinero = via(m, "money").item;
  assert.equal(dinero?.datos.tipo, "navegar");
  assert.ok(dinero?.href, "lo que navega tiene a dónde ir");
});

// --- Resolver promueve (el bug que encontró la revisión de Codex) ---

// La primera versión anulaba el ítem YA ELEGIDO en el componente, así que el
// carril se quedaba en falsa calma con una segunda tarjeta suya esperando. El
// comentario del componente afirmaba la conducta que el código no tenía.
test("RESOLVER PROMUEVE: al caer el primero sube el siguiente", () => {
  // Dos compitiendo: la Única Cosa y las vencidas.
  const e = entrada({ unicaCosa: "Cerrar el rediseño", vencidas: 2 });

  const antes = componerMando(e);
  const primero = antes.items[0]!;

  const despues = componerMando(e, [], [primero.id]);

  assert.ok(despues.items[0], "no puede quedarse vacío con otra tarjeta esperando");
  assert.notEqual(despues.items[0]!.id, primero.id);
  assert.ok(!despues.items.some((i) => i.id === primero.id), "lo resuelto sí desaparece");
});

test("resolver puede cambiar de frente sin despeinarse", () => {
  // Ejecución primero; al resolverla, sube el dinero.
  const e = entrada({ unicaCosa: "Algo", presupuestoEnRojo: true });

  const antes = componerMando(e);
  assert.equal(antes.items[0]?.carril, "execution");

  const despues = componerMando(e, [], [antes.items[0]!.id]);
  assert.equal(despues.items[0]?.carril, "money");
});

test("resolver lo último deja el cierre, y el cierre sigue navegando", () => {
  const e = entrada({ presupuestoEnRojo: true });
  const unico = componerMando(e).items[0]!;

  const m = componerMando(e, [], [unico.id]);

  assert.deepEqual(m.items, []);
  assert.ok(m.cierre.length > 0);
  for (const f of m.frentes) {
    assert.ok(f.estado.length > 0 && f.href.length > 0, `${f.carril} se quedó mudo en el cierre`);
  }
});
