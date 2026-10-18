import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESCRITURA_POR_TABLA,
  TABLAS_PROHIBIDAS,
  entradaDe,
  camposDe,
  type EntradaDeEscritura
} from "../../src/lib/domain/centro/escritura/registro.ts";
import { TABLAS_CONSULTABLES, dominioDeTabla } from "../../src/lib/insights/context.ts";

const tablas = Object.keys(ESCRITURA_POR_TABLA);
// Sin `as const`: iterar la unión de literales no compila al leer campos opcionales.
const REGISTRO = ESCRITURA_POR_TABLA as Record<string, EntradaDeEscritura>;

test("Ninguna tabla prohibida está en el registro (profiles, sobre todo)", () => {
  assert.ok(TABLAS_PROHIBIDAS.includes("profiles"));
  for (const t of TABLAS_PROHIBIDAS) assert.ok(!tablas.includes(t), t);
});

test("Entregas 1, 2 y 3 (D-203, D-205): las tablas que el Centro escribe", () => {
  assert.deepStrictEqual(tablas.sort(), [
    "accounts", "assets", "body_measurements", "books", "budgets", "comments", "daily_reflections", "debts",
    "financial_goals", "food_entries", "habit_logs", "identity_traits", "journal_entries", "logbook", "notes",
    "occupations", "personal_goals", "projects", "reminders", "savings_goals", "tasks"
  ]);
});

test("D-205 E3: `suelto` solo en números, uno por tabla; `valoresPorSinonimo` nombra sinónimos y opciones reales", () => {
  for (const [tabla, e] of Object.entries(ESCRITURA_POR_TABLA) as [string, EntradaDeEscritura][]) {
    const sueltos = Object.entries(e.campos).filter(([, c]) => c.suelto);
    assert.ok(sueltos.length <= 1, tabla);
    for (const [n, c] of sueltos) assert.ok(c.tipo === "numero" || c.tipo === "entero", `${tabla}.${n}`);
    for (const [frase, valores] of Object.entries(e.valoresPorSinonimo ?? {})) {
      assert.ok(e.sinonimos.includes(frase), `${tabla}: «${frase}»`);
      for (const [campo, v] of Object.entries(valores)) assert.ok(e.campos[campo]?.opciones?.includes(v), `${tabla}.${campo}=${v}`);
    }
  }
});

test("El dominio de cada tabla es el de la lista blanca de lectura", () => {
  for (const [t, e] of Object.entries(REGISTRO)) {
    assert.strictEqual(e.dominio, dominioDeTabla(t), t);
  }
});

test("El título de la tarjeta es un campo del registro, y cada ref apunta a una tabla legible", () => {
  for (const [t, e] of Object.entries(REGISTRO)) {
    assert.ok(e.titulo in e.campos, `${t}.titulo`);
    for (const [n, c] of Object.entries(e.campos)) {
      if (c.tipo === "ref") assert.ok(c.refTabla && c.refTabla in TABLAS_CONSULTABLES, `${t}.${n}`);
      if (c.tipo === "opcion") assert.ok(c.opciones && c.opciones.length > 0, `${t}.${n}`);
    }
  }
});

test("Ningún campo de identidad o autoría es escribible", () => {
  for (const [t, e] of Object.entries(REGISTRO)) {
    for (const prohibido of ["id", "user_id", "workspace_id", "created_by", "updated_by", "version", "created_at"]) {
      assert.ok(!(prohibido in e.campos), `${t}.${prohibido}`);
    }
  }
});

test("entradaDe: un dominio apagado y una tabla inexistente dan lo mismo", () => {
  assert.strictEqual(entradaDe("tasks", ["nutrition"]), null);
  assert.strictEqual(entradaDe("profiles", ["execution", "nutrition"]), null);
  assert.strictEqual(entradaDe("tasks", ["execution"])?.tabla, "tasks");
});

test("camposDe: soloCrear no se edita; soloEditar no se crea", () => {
  const e = ESCRITURA_POR_TABLA.tasks;
  const crear = camposDe(e, "crear").map(([n]) => n);
  const editar = camposDe(e, "editar").map(([n]) => n);
  assert.ok(crear.includes("project_id") && !editar.includes("project_id"));
  assert.ok(editar.includes("status") && !crear.includes("status"));
});

// D-205: el vocabulario del intérprete vive en el registro.
import { normalizar } from "../../src/lib/domain/centro/interprete/normalizar.ts";

test("D-205: toda tabla tiene sinónimos, y ninguno apunta a dos tablas", () => {
  const visto = new Map<string, string>();
  for (const [tabla, e] of Object.entries(ESCRITURA_POR_TABLA) as [string, EntradaDeEscritura][]) {
    assert.ok(e.sinonimos.length > 0, `${tabla} sin sinónimos`);
    for (const s of e.sinonimos) {
      const n = normalizar(s);
      assert.equal(n, s, `«${s}» tiene que escribirse ya normalizado`);
      assert.ok(!visto.has(n) || visto.get(n) === tabla, `«${s}» está en ${visto.get(n)} y en ${tabla}`);
      visto.set(n, tabla);
    }
  }
});

test("D-205: los sinónimos de una opción solo llevan a valores de esa opción", () => {
  for (const [tabla, e] of Object.entries(ESCRITURA_POR_TABLA) as [string, EntradaDeEscritura][]) {
    for (const [campo, c] of Object.entries(e.campos)) {
      if (!c.sinonimos) continue;
      assert.equal(c.tipo, "opcion", `${tabla}.${campo}: sinónimos en un campo que no es opción`);
      for (const [valor, frases] of Object.entries(c.sinonimos)) {
        assert.ok(c.opciones?.includes(valor), `${tabla}.${campo}: «${valor}» no es una opción`);
        for (const f of frases) assert.equal(normalizar(f), f, `«${f}» tiene que escribirse ya normalizado`);
      }
    }
  }
});

test("D-205: las menciones solo existen en refs", () => {
  for (const [tabla, e] of Object.entries(ESCRITURA_POR_TABLA) as [string, EntradaDeEscritura][]) {
    for (const [campo, c] of Object.entries(e.campos)) {
      if (c.menciones) assert.equal(c.tipo, "ref", `${tabla}.${campo}`);
      if (c.unidades) assert.ok(c.tipo === "numero" || c.tipo === "entero", `${tabla}.${campo}`);
    }
  }
});

test("D-205: `dictado`, si existe, es un campo de texto o una ref que se puede crear", () => {
  for (const [tabla, e] of Object.entries(ESCRITURA_POR_TABLA) as [string, EntradaDeEscritura][]) {
    if (!e.dictado) continue;
    const c = e.campos[e.dictado];
    assert.ok(c && (c.tipo === "texto" || c.tipo === "ref") && !c.soloEditar, `${tabla}.${e.dictado}`);
  }
});

test("D-205 E2: `porDefecto` es un valor válido de su campo, y `etiquetas` solo van en números", () => {
  for (const [tabla, e] of Object.entries(ESCRITURA_POR_TABLA) as [string, EntradaDeEscritura][]) {
    for (const [campo, c] of Object.entries(e.campos)) {
      if (c.etiquetas) assert.ok(c.tipo === "numero" || c.tipo === "entero", `${tabla}.${campo}`);
      if (c.porDefecto === undefined) continue;
      if (c.tipo === "opcion") assert.ok(c.opciones?.includes(String(c.porDefecto)), `${tabla}.${campo}`);
      else if (c.tipo === "fecha") assert.equal(c.porDefecto, "hoy", `${tabla}.${campo}`);
      else if (c.tipo === "numero" || c.tipo === "entero") assert.equal(typeof c.porDefecto, "number", `${tabla}.${campo}`);
      else assert.equal(c.tipo, "texto", `${tabla}.${campo}`);
    }
  }
});

test("D-205 E2: `crearCon` solo en tablas que se crean, y sin chocar con un verbo de tabla", () => {
  for (const [tabla, e] of Object.entries(ESCRITURA_POR_TABLA) as [string, EntradaDeEscritura][]) {
    if (!e.crearCon) continue;
    assert.ok(e.operaciones.includes("crear"), tabla);
    for (const v of e.crearCon) assert.equal(normalizar(v), v, `«${v}»`);
  }
});

test("D-205 E2: la columna de nombre de cada ref (`refTitulo`, o `title`) se puede leer en su tabla", () => {
  for (const [tabla, e] of Object.entries(ESCRITURA_POR_TABLA) as [string, EntradaDeEscritura][]) {
    for (const [campo, c] of Object.entries(e.campos)) {
      if (c.tipo !== "ref") continue;
      const select = (TABLAS_CONSULTABLES as Record<string, { select: string }>)[c.refTabla!]!.select.split(",").map((x) => x.trim());
      assert.ok(select.includes(c.refTitulo ?? "title") && select.includes("created_at"), `${tabla}.${campo} → ${c.refTabla}`);
    }
  }
});
