// tests/domain/insights-context.test.ts
// El filtro de privacidad del motor. Si algo de aquí se rompe, se filtran
// datos entre dominios o hacia el proveedor del modelo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedDomains,
  buildContext,
  tablaConsultable,
  MAX_FACTS,
  MAX_FACTS_COACH,
  TABLAS_CONSULTABLES
} from "../../src/lib/insights/context.ts";
import type { Domain, Fact } from "../../src/lib/domain/insights/types.ts";

function fact(id: string, domain: Domain, weight: number, label = id): Fact {
  return { id, domain, label, weight, refs: [] };
}

test("allowedDomains: un scope privado solo ve lo suyo", () => {
  assert.deepStrictEqual(allowedDomains("money"), ["money"]);
  assert.deepStrictEqual(allowedDomains("debt"), ["debt"]);
  assert.deepStrictEqual(allowedDomains("habits"), ["habits"]);
  assert.deepStrictEqual(allowedDomains("time"), ["time"]);
  assert.deepStrictEqual(allowedDomains("growth"), ["growth"]);
});

test("allowedDomains: global cubre los ocho dominios, activity incluida", () => {
  // Invierte lo que este mismo archivo probaba antes de 0053. `activity` está
  // dentro a propósito: lo que alguien hizo con su equipo es parte de su
  // semana, y dejarlo fuera obligaba al chat a decir que no tenía acceso.
  const globales = allowedDomains("global");
  for (const d of ["money", "debt", "habits", "time", "execution", "nutrition", "growth", "activity"]) {
    assert.ok(globales.includes(d as Domain), `${d} debe estar en global`);
  }
});

test("allowedDomains: execution en proyecto personal suma time", () => {
  assert.deepStrictEqual(allowedDomains("execution", { projectIsWorkspace: false }), ["execution", "time"]);
});

test("allowedDomains: execution en proyecto de workspace NO alcanza ningún dominio privado", () => {
  // La defensa principal contra inyección de prompt (§4.3): no hay a qué apuntar.
  const dominios = allowedDomains("execution", { projectIsWorkspace: true });
  assert.deepStrictEqual(dominios, ["execution"]);
  for (const privado of ["money", "debt", "habits", "time"]) {
    assert.ok(!dominios.includes(privado as Domain), `${privado} no debe estar`);
  }
});

test("buildContext: descarta los hechos de dominios fuera del allowlist", () => {
  const ctx = buildContext({
    scope: "money",
    facts: [fact("m1", "money", 0.9), fact("h1", "habits", 0.95), fact("e1", "execution", 1)]
  });
  assert.deepStrictEqual(ctx.facts.map((f) => f.id), ["m1"]);
});

test("buildContext: un hecho privado NO viaja en el contexto de un workspace", () => {
  const ctx = buildContext({
    scope: "execution",
    projectIsWorkspace: true,
    facts: [fact("saldo", "money", 1, "Saldo de deuda: 120000"), fact("tarea", "execution", 0.2)]
  });
  assert.deepStrictEqual(ctx.facts.map((f) => f.id), ["tarea"]);
  assert.ok(!JSON.stringify(ctx).includes("120000"), "la cifra privada no puede aparecer en el contexto");
});

test("buildContext: ordena por peso y recorta al tope, quedándose con los más anómalos", () => {
  const muchos = Array.from({ length: MAX_FACTS + 10 }, (_, i) => fact(`f${i}`, "money", i / 100));
  const ctx = buildContext({ scope: "money", facts: muchos });
  assert.strictEqual(ctx.facts.length, MAX_FACTS);
  assert.strictEqual(ctx.trimmed, 10);
  assert.strictEqual(ctx.facts[0].weight, muchos[muchos.length - 1].weight, "el más anómalo va primero");
});

test("buildContext: el texto de los hechos pasa TAL CUAL, con nombres reales", () => {
  // 0053 retiró la seudonimización. Esta prueba es lo que impide que vuelva a
  // colarse sin decidirlo: si alguien reintroduce un filtro de nombres, aquí
  // se entera.
  const ctx = buildContext({
    scope: "money",
    facts: [fact("m1", "money", 1, "Ana gastó 4000 desde BBVA Nómina")],
    previousRejections: [{ status: "Suppressed", text: "No sugerir recortar el gasto de Ana" }]
  });
  assert.strictEqual(ctx.facts[0].label, "Ana gastó 4000 desde BBVA Nómina");
  assert.deepStrictEqual(ctx.rejections, ["No sugerir recortar el gasto de Ana"]);
});

test("buildContext: maxFacts sube el tope para el coach sin mover el de siempre", () => {
  const muchos = Array.from({ length: MAX_FACTS_COACH + 5 }, (_, i) => fact(`f${i}`, "money", i / 1000));
  assert.strictEqual(buildContext({ scope: "money", facts: muchos }).facts.length, MAX_FACTS);
  assert.strictEqual(
    buildContext({ scope: "money", facts: muchos, maxFacts: MAX_FACTS_COACH }).facts.length,
    MAX_FACTS_COACH
  );
});

// --- Fase 2: opt-in por dominio y memoria ----------------------------------

test("buildContext: un dominio que el usuario NO autorizó no sale, aunque el ámbito lo permita", () => {
  // El allowlist dice qué PUEDE ver el ámbito; el opt-in, qué quiere el usuario
  // que salga. Solo viaja la intersección.
  const ctx = buildContext({
    scope: "money",
    facts: [fact("m1", "money", 1, "Alimentos: 8400")],
    enabledDomains: []
  });
  assert.deepStrictEqual(ctx.facts, []);
  assert.deepStrictEqual(ctx.domains, []);
  assert.deepStrictEqual(ctx.skippedDomains, ["money"], "y se dice cuál se omitió");
});

test("buildContext: con el dominio autorizado, todo pasa y nada queda omitido", () => {
  const ctx = buildContext({
    scope: "money",
    facts: [fact("m1", "money", 1)],
    enabledDomains: ["money"]
  });
  assert.deepStrictEqual(ctx.domains, ["money"]);
  assert.deepStrictEqual(ctx.skippedDomains, []);
  assert.strictEqual(ctx.facts.length, 1);
});

test("buildContext: sin lista de autorizados no se aplica el filtro", () => {
  const ctx = buildContext({ scope: "money", facts: [fact("m1", "money", 1)] });
  assert.strictEqual(ctx.facts.length, 1);
  assert.deepStrictEqual(ctx.skippedDomains, []);
});

test("buildContext: en global se omiten solo los dominios apagados, no todos", () => {
  const ctx = buildContext({
    scope: "global",
    facts: [fact("m1", "money", 1), fact("h1", "habits", 1)],
    enabledDomains: ["habits"]
  });
  assert.deepStrictEqual(ctx.facts.map((f) => f.id), ["h1"]);
  assert.ok(ctx.skippedDomains.includes("money"));
  assert.ok(!ctx.skippedDomains.includes("habits"));
});

test("buildContext: la memoria vigente entra y la caducada no", () => {
  const ctx = buildContext({
    scope: "money",
    facts: [fact("m1", "money", 1)],
    todayISO: "2026-08-24",
    memory: [
      { id: "a", scope: "finance", origin: "user", text: "Quiero liquidar la tarjeta antes de diciembre", validUntil: null },
      { id: "b", scope: "finance", origin: "user", text: "Ya caducó", validUntil: "2026-01-01" }
    ]
  });
  assert.deepStrictEqual(ctx.memory, ["Quiero liquidar la tarjeta antes de diciembre"]);
});

test("buildContext: sin memoria cargada el contexto la deja vacía, no undefined", () => {
  const ctx = buildContext({ scope: "money", facts: [fact("m1", "money", 1)] });
  assert.deepStrictEqual(ctx.memory, []);
});

// --- Lista blanca de consulta (A2) -------------------------------------------
// Las herramientas del modelo pueden bajar a la fila, y esto es lo único que
// decide a qué filas. Si una prueba de este bloque se rompe, el modelo está
// mirando algo que nadie autorizó.

test("tablaConsultable: una tabla fuera de la lista no se consulta, aunque su dominio esté autorizado", () => {
  assert.strictEqual(tablaConsultable("profiles", ["money", "habits", "time", "execution", "debt"]), null);
  assert.strictEqual(tablaConsultable("audit_log", ["money", "habits", "time", "execution", "debt"]), null);
  assert.strictEqual(tablaConsultable("ai_chat_messages", ["money", "habits", "time", "execution", "debt"]), null);
});

test("tablaConsultable: una tabla de la lista cuyo dominio NO autorizó el usuario tampoco se consulta", () => {
  assert.strictEqual(tablaConsultable("journal_entries", ["habits"]), null);
});

test("tablaConsultable: una tabla autorizada devuelve su dominio y la columna por la que se acota la ventana", () => {
  const t = tablaConsultable("journal_entries", ["money"]);
  assert.ok(t);
  assert.strictEqual(t.domain, "money");
  assert.strictEqual(t.fecha, "entry_date");
});

test("tablaConsultable: sin ningún dominio autorizado no se consulta nada", () => {
  for (const tabla of Object.keys(TABLAS_CONSULTABLES)) {
    assert.strictEqual(tablaConsultable(tabla, []), null, `${tabla} no debería consultarse sin opt-in`);
  }
});

test("TABLAS_CONSULTABLES: ninguna tabla escapa a un dominio que 'global' no cubra", () => {
  const globales = allowedDomains("global");
  for (const [tabla, meta] of Object.entries(TABLAS_CONSULTABLES)) {
    assert.ok(globales.includes(meta.domain), `${tabla} apunta a ${meta.domain}, que no está en global`);
  }
});

test("TABLAS_CONSULTABLES: sigue siendo una lista BLANCA — lo sensible no está", () => {
  // La lista pasó de 11 tablas a 39 en 0053. Lo que hace que ese crecimiento
  // sea defendible es que estas siguen fuera, y que estarlo no depende de que
  // nadie se acuerde: no aparecen porque no se escribieron.
  for (const prohibida of [
    "profiles",
    "audit_log",
    "ai_chat_messages",
    "consents",
    "push_subscriptions",
    "notification_prefs",
    "memberships",
    "invitations",
    "template_catalog",
    "coach_proposals"
  ]) {
    assert.ok(!(prohibida in TABLAS_CONSULTABLES), `${prohibida} no puede ser consultable`);
  }
});

test("TABLAS_CONSULTABLES: solo los catálogos acotados pueden ir sin columna de fecha", () => {
  // Una tabla sin ventana se trae hasta el tope de filas. Eso solo es aceptable
  // donde el total cabe ahí; en cualquier otra la ventana es lo que impide que
  // el corte se decida al azar.
  const sinFecha = Object.entries(TABLAS_CONSULTABLES)
    .filter(([, meta]) => meta.fecha === null)
    .map(([tabla]) => tabla)
    .sort();
  assert.deepStrictEqual(sinFecha, ["categories", "folders", "nutrition_profiles", "task_groups"]);
});

test("TABLAS_CONSULTABLES: cada tabla declara columnas explícitas, nunca un '*'", () => {
  for (const [tabla, meta] of Object.entries(TABLAS_CONSULTABLES)) {
    assert.ok(meta.select.length > 0, `${tabla} sin select`);
    assert.ok(!meta.select.includes("*"), `${tabla} usa '*' y crecería solo`);
  }
});
