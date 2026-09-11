// tests/domain/execution-project-deps.test.ts
// Las dependencias ENTRE proyectos. Hasta ahora `projects.dependencies` era una
// columna de TEXTO libre —prosa que nadie podía recorrer—, así que «¿qué
// proyectos bloquea este?» era incontestable.
//
// Lo que se defiende aquí es el ciclo. `tasks.deps` (0003) nunca tuvo guarda: se
// limita a quitar la autorreferencia, así que A→B→A es posible hoy en tareas. En
// proyectos no se repite ese error, porque un ciclo aquí deja sin sentido el
// camino crítico del grafo y hace entrar en bucle al secuenciador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_DEPS, cicloAlAnadir, limpiarDeps } from "../../src/lib/domain/execution/project-deps.ts";

const grafo = (pares: [string, string[]][]) => new Map(pares);

test("limpiarDeps quita la autorreferencia", () => {
  // Un proyecto que depende de sí mismo se bloquea para siempre.
  assert.deepStrictEqual(limpiarDeps("a", ["a", "b"]), ["b"]);
});

test("limpiarDeps quita duplicados y conserva el orden de llegada", () => {
  assert.deepStrictEqual(limpiarDeps("x", ["b", "a", "b"]), ["b", "a"]);
});

test("limpiarDeps descarta lo vacío en vez de guardarlo", () => {
  assert.deepStrictEqual(limpiarDeps("x", ["", "  ", "a"]), ["a"]);
});

test("limpiarDeps tiene tope: una lista sin límite no es una dependencia, es un montón", () => {
  const muchas = Array.from({ length: MAX_DEPS + 10 }, (_, i) => `p${i}`);
  assert.strictEqual(limpiarDeps("x", muchas).length, MAX_DEPS);
});

test("una dependencia directa hacia atrás cierra el círculo", () => {
  // B ya depende de A. Si A pasa a depender de B, ninguno puede empezar.
  const actual = grafo([["b", ["a"]]]);
  assert.deepStrictEqual(cicloAlAnadir("a", ["b"], actual), ["a", "b", "a"]);
});

test("y también la indirecta, que es la que no se ve a simple vista", () => {
  // C depende de B, B depende de A. Que A dependa de C cierra el círculo por
  // un camino que nadie tiene en la cabeza al pulsar la casilla.
  const actual = grafo([["c", ["b"]], ["b", ["a"]]]);
  assert.deepStrictEqual(cicloAlAnadir("a", ["c"], actual), ["a", "c", "b", "a"]);
});

test("una dependencia que NO cierra nada se acepta", () => {
  const actual = grafo([["b", ["a"]]]);
  assert.strictEqual(cicloAlAnadir("c", ["b"], actual), null);
});

test("el diamante no es un ciclo", () => {
  // D depende de B y de C, y las dos dependen de A. Es una forma perfectamente
  // legítima y un detector ingenuo la confunde con un ciclo al visitar A dos
  // veces por caminos distintos.
  const actual = grafo([["b", ["a"]], ["c", ["a"]]]);
  assert.strictEqual(cicloAlAnadir("d", ["b", "c"], actual), null);
});

test("se comprueban TODAS las dependencias nuevas, no solo la primera", () => {
  const actual = grafo([["z", ["a"]]]);
  assert.notStrictEqual(cicloAlAnadir("a", ["b", "z"], actual), null);
});

test("un ciclo que YA existía en los datos no cuelga el detector", () => {
  // No debería pasar, pero `tasks.deps` demuestra que un grafo sin guarda
  // acumula formas raras. Colgarse sería peor que informar.
  const actual = grafo([["a", ["b"]], ["b", ["a"]]]);
  const r = cicloAlAnadir("c", ["a"], actual);
  assert.ok(r === null || Array.isArray(r));
});

test("reemplazar la lista entera se juzga por la lista NUEVA, no por la vieja", () => {
  // Si A dependía de B y se cambia a depender de nada, no hay ciclo aunque la
  // combinación anterior lo tuviera.
  const actual = grafo([["a", ["b"]], ["b", ["a"]]]);
  assert.strictEqual(cicloAlAnadir("a", [], actual), null);
});
