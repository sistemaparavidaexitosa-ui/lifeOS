// tests/domain/development-reading-plan.test.ts
//
// La semana de referencia en todo el archivo es la del lunes 2026-08-31:
//   2026-08-24  semana PASADA
//   2026-08-31  semana ACTUAL  (hoy = miércoles 2026-09-02)
//   2026-09-07  semana FUTURA
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planWeeks,
  planStatus,
  focusBook,
  requiredPace,
  type PlanEntry,
  type PlannedBook
} from "../../src/lib/domain/development/reading-plan.ts";

const HOY = "2026-09-02"; // miércoles de la semana del 2026-08-31
const PASADA = "2026-08-24";
const ACTUAL = "2026-08-31";
const FUTURA = "2026-09-07";

const libro = (over: Partial<PlannedBook> = {}): PlannedBook => ({
  id: "b1",
  status: "Leyendo",
  currentPage: 60,
  totalPages: 300,
  updatedAt: "2026-09-01T10:00:00Z",
  ...over
});

const entrada = (bookId: string, weekStart: string, position = 0): PlanEntry => ({ bookId, weekStart, position });

// ---------------------------------------------------------------------------
// planWeeks
// ---------------------------------------------------------------------------
test("planWeeks convierte «primera semana + cuántas» en las filas a insertar", () => {
  assert.deepStrictEqual(planWeeks(ACTUAL, 3), ["2026-08-31", "2026-09-07", "2026-09-14"]);
});

test("planWeeks normaliza al lunes: la columna solo acepta lunes", () => {
  // Se pasa un miércoles a propósito; la fila no puede salir en miércoles.
  assert.deepStrictEqual(planWeeks("2026-09-02", 2), ["2026-08-31", "2026-09-07"]);
});

test("planWeeks con un conteo no positivo no inventa semanas", () => {
  assert.deepStrictEqual(planWeeks(ACTUAL, 0), []);
  assert.deepStrictEqual(planWeeks(ACTUAL, -3), []);
});

// ---------------------------------------------------------------------------
// planStatus
// ---------------------------------------------------------------------------
test("planStatus: sin entradas no hay plan que reportar", () => {
  assert.strictEqual(planStatus([], libro(), HOY), "Sin plan");
});

test("planStatus: una semana que ya pasó y el libro sin terminar es Atrasado", () => {
  assert.strictEqual(planStatus([entrada("b1", PASADA)], libro(), HOY), "Atrasado");
});

test("planStatus: un plan de varias semanas que ARRANCÓ la semana pasada NO está atrasado", () => {
  // Este es el caso que distingue «empezó antes» de «se pasó de la fecha».
  // Manda la ÚLTIMA semana programada, no la primera.
  const plan = [entrada("b1", PASADA), entrada("b1", ACTUAL), entrada("b1", FUTURA)];
  assert.strictEqual(planStatus(plan, libro(), HOY), "Esta semana");
});

test("planStatus: un libro Terminado en una semana pasada no está atrasado", () => {
  assert.strictEqual(planStatus([entrada("b1", PASADA)], libro({ status: "Terminado" }), HOY), "Programado");
});

test("planStatus: solo semanas futuras es Programado", () => {
  assert.strictEqual(planStatus([entrada("b1", FUTURA)], libro(), HOY), "Programado");
});

// ---------------------------------------------------------------------------
// focusBook — la regla de «el más urgente»
// ---------------------------------------------------------------------------
test("focusBook: lo atrasado gana a lo de esta semana", () => {
  const libros = [libro({ id: "atrasado" }), libro({ id: "deEstaSemana" })];
  const plan = [entrada("atrasado", PASADA), entrada("deEstaSemana", ACTUAL)];
  const foco = focusBook(plan, libros, HOY);
  assert.strictEqual(foco?.bookId, "atrasado");
  assert.strictEqual(foco?.reason, "atrasado");
});

test("focusBook: entre dos atrasados manda la semana más vieja", () => {
  const libros = [libro({ id: "viejo" }), libro({ id: "reciente" })];
  const plan = [entrada("viejo", "2026-08-17"), entrada("reciente", PASADA)];
  assert.strictEqual(focusBook(plan, libros, HOY)?.bookId, "viejo");
});

test("focusBook: dentro de la semana actual manda la posición", () => {
  const libros = [libro({ id: "segundo" }), libro({ id: "primero" })];
  const plan = [entrada("segundo", ACTUAL, 1), entrada("primero", ACTUAL, 0)];
  const foco = focusBook(plan, libros, HOY);
  assert.strictEqual(foco?.bookId, "primero");
  assert.strictEqual(foco?.reason, "esta semana");
  assert.strictEqual(foco?.weekStart, ACTUAL);
});

test("focusBook: un libro Terminado no puede ser el foco aunque esté programado", () => {
  const libros = [libro({ id: "hecho", status: "Terminado" }), libro({ id: "vivo" })];
  const plan = [entrada("hecho", PASADA), entrada("vivo", ACTUAL)];
  assert.strictEqual(focusBook(plan, libros, HOY)?.bookId, "vivo");
});

test("focusBook: una semana futura todavía no es el foco", () => {
  const libros = [libro({ id: "b1", status: "Por leer" })];
  assert.strictEqual(focusBook([entrada("b1", FUTURA)], libros, HOY), null);
});

test("focusBook: sin plan cae al libro Leyendo más reciente, como hacía Home", () => {
  const libros = [
    libro({ id: "viejo", updatedAt: "2026-08-01T10:00:00Z" }),
    libro({ id: "nuevo", updatedAt: "2026-09-01T10:00:00Z" }),
    libro({ id: "porLeer", status: "Por leer", updatedAt: "2026-09-02T10:00:00Z" })
  ];
  const foco = focusBook([], libros, HOY);
  assert.strictEqual(foco?.bookId, "nuevo");
  assert.strictEqual(foco?.reason, "sin plan");
  assert.strictEqual(foco?.weekStart, null);
});

test("focusBook: sin libros que puedan serlo, nadie es el foco", () => {
  assert.strictEqual(focusBook([], [], HOY), null);
  assert.strictEqual(focusBook([], [libro({ status: "Terminado" })], HOY), null);
});

test("focusBook: un plan que apunta a un libro borrado se ignora, no revienta", () => {
  const foco = focusBook([entrada("fantasma", PASADA)], [libro({ id: "b1" })], HOY);
  assert.strictEqual(foco?.bookId, "b1");
  assert.strictEqual(foco?.reason, "sin plan");
});

// ---------------------------------------------------------------------------
// requiredPace — lo que convierte la cola en un plan medible
// ---------------------------------------------------------------------------
test("requiredPace: páginas por día para llegar al domingo de la última semana", () => {
  // Faltan 240 págs.; la última semana programada es la del 2026-08-31, que
  // termina el domingo 2026-09-06. De hoy (miércoles) a ese domingo hay 5 días
  // contando hoy. 240 / 5 = 48.
  const paso = requiredPace(libro(), [entrada("b1", ACTUAL)], HOY);
  assert.strictEqual(paso?.pagesPerDay, 48);
  assert.strictEqual(paso?.daysLeft, 5);
  assert.strictEqual(paso?.lastDay, "2026-09-06");
});

test("requiredPace: manda la ÚLTIMA semana programada", () => {
  // Con dos semanas el plazo llega al 2026-09-13: 12 días contando hoy.
  const paso = requiredPace(libro(), [entrada("b1", ACTUAL), entrada("b1", FUTURA)], HOY);
  assert.strictEqual(paso?.lastDay, "2026-09-13");
  assert.strictEqual(paso?.daysLeft, 12);
  assert.strictEqual(paso?.pagesPerDay, 20);
});

test("requiredPace: con el plazo vencido queda hoy, no un número negativo", () => {
  const paso = requiredPace(libro(), [entrada("b1", PASADA)], HOY);
  assert.strictEqual(paso?.daysLeft, 1);
  assert.strictEqual(paso?.pagesPerDay, 240);
});

test("requiredPace: sin plan, sin total de páginas o ya terminado NO se inventa un ritmo", () => {
  assert.strictEqual(requiredPace(libro(), [], HOY), null);
  assert.strictEqual(requiredPace(libro({ totalPages: 0 }), [entrada("b1", ACTUAL)], HOY), null);
  assert.strictEqual(requiredPace(libro({ status: "Terminado" }), [entrada("b1", ACTUAL)], HOY), null);
  // Ya pasaste la última página: no queda ritmo que exigir.
  assert.strictEqual(requiredPace(libro({ currentPage: 300 }), [entrada("b1", ACTUAL)], HOY), null);
});
