import { test } from "node:test";
import assert from "node:assert/strict";
import { idDeFila, limiteConsulta, ventanaConsulta, registrarFilas, MAX_DIAS_CONSULTA, tablasDeBusqueda, TABLAS_DE_BUSQUEDA, admiteSinVentana, textoDeBusqueda, MAX_TEXTO_BUSQUEDA, enOrdenDeBusqueda } from "../../src/lib/domain/ai/tools.ts";
import { MAX_FILAS_CONSULTA, dominioDeTabla } from "../../src/lib/insights/context.ts";

// Lo que el modelo pide NO es de fiar: son argumentos generados, no validados.
// Estas reglas son las que impiden que una consulta suya se traiga una vida
// entera o una ventana sin sentido.

test("ventanaConsulta: una ventana normal se acepta y el final es EXCLUSIVO, para que el último día entre entero", () => {
  const v = ventanaConsulta("2026-09-01", "2026-09-03", "2026-09-03");
  assert.deepStrictEqual(v, { ok: true, desde: "2026-09-01", hastaExclusivo: "2026-09-04" });
});

test("ventanaConsulta: el fin de mes avanza de mes, no al día 32", () => {
  const v = ventanaConsulta("2026-08-01", "2026-08-31", "2026-09-03");
  assert.strictEqual(v.ok && v.hastaExclusivo, "2026-09-01");
});

test("ventanaConsulta: una fecha que no es una fecha se rechaza", () => {
  assert.strictEqual(ventanaConsulta("ayer", "2026-09-03", "2026-09-03").ok, false);
  assert.strictEqual(ventanaConsulta("2026-13-45", "2026-09-03", "2026-09-03").ok, false);
});

test("ventanaConsulta: el orden invertido se rechaza en vez de devolver vacío en silencio", () => {
  assert.strictEqual(ventanaConsulta("2026-09-03", "2026-09-01", "2026-09-03").ok, false);
});

test("ventanaConsulta: no se consulta el futuro — el final se recorta a hoy", () => {
  const v = ventanaConsulta("2026-09-01", "2027-01-01", "2026-09-03");
  assert.strictEqual(v.ok && v.hastaExclusivo, "2026-09-04");
});

test("ventanaConsulta: una ventana enorme se recorta por el principio, no se rechaza", () => {
  const v = ventanaConsulta("2000-01-01", "2026-09-03", "2026-09-03");
  assert.ok(v.ok);
  const dias = (Date.parse(v.hastaExclusivo) - Date.parse(v.desde)) / 86400000;
  assert.strictEqual(dias, MAX_DIAS_CONSULTA);
});

test("limiteConsulta: lo que pida el modelo se acota al tope, y un disparate cae en el tope", () => {
  assert.strictEqual(limiteConsulta(10), 10);
  assert.strictEqual(limiteConsulta(5000), MAX_FILAS_CONSULTA);
  assert.strictEqual(limiteConsulta(0), MAX_FILAS_CONSULTA);
  assert.strictEqual(limiteConsulta(undefined), MAX_FILAS_CONSULTA);
  assert.strictEqual(limiteConsulta(-3), MAX_FILAS_CONSULTA);
});

test("idDeFila: el id que se le enseña al modelo dice de qué tabla salió, para poder auditar la cita", () => {
  assert.strictEqual(idDeFila("habit_logs", "abc"), "fila:habit_logs:abc");
});

// `consultar` (src/lib/ai/tools.ts) no se puede importar aquí: es `server-only`
// y usa alias `@/`. `registrarFilas` es la parte pura de lo que hace con cada
// fila que trae de Supabase, y es lo que hace falta probar (D-194).

test("registrarFilas conserva el valor de cada fila entregada, no solo su id", () => {
  const mapa = new Map<string, Record<string, unknown>>();
  registrarFilas(mapa, "debts", [{ id: "d1", name: "Tarjeta", balance: 4000 }]);
  assert.deepStrictEqual(mapa.get("fila:debts:d1"), { id: "d1", name: "Tarjeta", balance: 4000 });
});

test("registrarFilas: una fila sin id de cadena se cita como 'unica'", () => {
  const mapa = new Map<string, Record<string, unknown>>();
  const filas = registrarFilas(mapa, "nutrition_profiles", [{ meta: 2000 }]);
  assert.strictEqual(filas[0].id, "fila:nutrition_profiles:unica");
  assert.deepStrictEqual(mapa.get("fila:nutrition_profiles:unica"), { meta: 2000 });
});

// ---------------------------------------------------------------- buscar
// La búsqueda por nombre cruza TODAS las tablas a la vez, así que la única
// barrera que queda del lado del código es no pedirle a la RPC una tabla de un
// dominio que el usuario no encendió.

test("tablasDeBusqueda: solo las tablas cuyos dominios están autorizados", () => {
  const t = tablasDeBusqueda(["habits"]);
  assert.ok(t.includes("habits"));
  assert.ok(t.includes("routines"));
  assert.ok(!t.includes("books"), "books es de growth");
  assert.ok(!t.includes("debts"), "debts es de debt");
  assert.ok(!t.includes("accounts"), "accounts es de money");
});

test("tablasDeBusqueda: sin dominios autorizados no se busca en nada", () => {
  assert.deepStrictEqual(tablasDeBusqueda([]), []);
});

test("tablasDeBusqueda: toda tabla de búsqueda está en la lista blanca, con dominio", () => {
  for (const tabla of TABLAS_DE_BUSQUEDA) {
    assert.notStrictEqual(dominioDeTabla(tabla), null, tabla);
  }
  const todas = tablasDeBusqueda(["money", "debt", "habits", "time", "execution", "nutrition", "growth", "activity"]);
  assert.deepStrictEqual([...todas].sort(), [...TABLAS_DE_BUSQUEDA].sort());
});

// ---------------------------------------------------- consultar sin fechas
// Un hábito o un libro creado hace meses no «ocurrió» en una ventana: existe.
// Filtrarlo por `created_at` lo escondía si el modelo no adivinaba la fecha.

test("admiteSinVentana: los catálogos se consultan sin fechas", () => {
  for (const t of ["habits", "routines", "projects", "books", "personal_goals", "key_results", "debts", "accounts", "savings_goals", "financial_goals", "investments", "assets", "liabilities", "notebooks", "identity_traits", "occupations", "family_members", "cashback_cards", "categories", "folders", "task_groups"]) {
    assert.strictEqual(admiteSinVentana(t), true, t);
  }
});

test("admiteSinVentana: los eventos siguen exigiendo ventana", () => {
  for (const t of ["habit_logs", "journal_entries", "food_entries", "daily_plans", "routine_runs", "book_progress", "logbook", "comments"]) {
    assert.strictEqual(admiteSinVentana(t), false, t);
  }
});

test("admiteSinVentana: una tabla que no existe no se admite", () => {
  assert.strictEqual(admiteSinVentana("auth_users"), false);
});

test("textoDeBusqueda: recorta espacios y acota la longitud antes de llegar a la RPC", () => {
  assert.strictEqual(textoDeBusqueda("  malpaso  "), "malpaso");
  assert.strictEqual(textoDeBusqueda("x".repeat(5000)).length, MAX_TEXTO_BUSQUEDA);
  assert.strictEqual(textoDeBusqueda(undefined), "");
  assert.strictEqual(textoDeBusqueda(42), "42");
});

test("enOrdenDeBusqueda: conserva el orden de relevancia de la RPC entre tablas", () => {
  const hallados = [
    { tabla: "books", id: "b1" },
    { tabla: "debts", id: "d1" },
    { tabla: "books", id: "b2" }
  ];
  const traidas = new Map<string, Record<string, unknown>[]>([
    ["books", [{ id: "b2", title: "Dos" }, { id: "b1", title: "Uno" }]],
    ["debts", [{ id: "d1", name: "Deuda" }]]
  ]);
  const orden = enOrdenDeBusqueda(hallados, traidas).map((f) => `${f.tabla}:${f.registro.id}`);
  assert.deepStrictEqual(orden, ["books:b1", "debts:d1", "books:b2"]);
});

test("enOrdenDeBusqueda: lo que la RPC nombró pero no se pudo traer se omite, sin inventarlo", () => {
  const r = enOrdenDeBusqueda([{ tabla: "books", id: "b1" }, { tabla: "debts", id: "d9" }], new Map([["books", [{ id: "b1" }]]]));
  assert.deepStrictEqual(r, [{ tabla: "books", registro: { id: "b1" } }]);
});
