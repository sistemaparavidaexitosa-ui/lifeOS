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

const via = (m: ReturnType<typeof componerMando>, c: (typeof CARRILES)[number]) =>
  m.carriles.find((v) => v.carril === c)!;

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
  const m = componerMando(e);

  const primeroDeEjecucion = orden.find((id) => id !== "dinero" && !id.startsWith("r1:"));
  assert.equal(via(m, "execution").item?.id, primeroDeEjecucion);
});

test("siempre son los tres carriles, en su orden", () => {
  const m = componerMando(entrada());

  assert.deepEqual(m.carriles.map((v) => v.carril), [...CARRILES]);
});

// Esconder el frente que va bien deja a la persona sin saber si es que no hay
// nada o es que no se miró.
test("un carril en calma NO se esconde: dice qué sabe y deja entrar", () => {
  const m = componerMando(
    entrada({ senalesDeCarril: { tareasDelPlan: 3, habitosPendientes: 0, identidadDeclarada: true } })
  );

  for (const v of m.carriles) {
    assert.equal(v.item, null);
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

  assert.equal(m.dominante, null);
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
    return m.carriles.find((v) => v.item?.id === "propuesta:p1")?.carril;
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

test("manda el frente de lo que más aprieta, no un orden fijo", () => {
  // Solo dinero: manda dinero aunque se pinte el tercero.
  assert.equal(componerMando(entrada({ presupuestoEnRojo: true })).dominante, "money");

  // Solo un hábito: manda desarrollo, que se pinta el segundo.
  assert.equal(componerMando(entrada({ proximoHabito: habito })).dominante, "development");
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

  for (const v of m.carriles) {
    if (!v.item) continue;
    assert.ok((CATEGORIAS as readonly string[]).includes(v.item.categoria), `categoría suelta: ${v.item.categoria}`);
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
  const apartado = antes.carriles.find((v) => v.item)!.item!.id;

  const despues = componerMando(e, [apartado]);

  // O sigue estando, o dejó subir al siguiente de su carril: lo que no puede
  // es desaparecer sin más.
  const sigue = despues.carriles.some((v) => v.item?.id === apartado);
  const subioOtro = despues.carriles.some((v) => v.item && v.item.id !== apartado);
  assert.ok(sigue || subioOtro, "apartar no es borrar");
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
