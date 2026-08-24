// tests/domain/insights-context.test.ts
// El filtro de privacidad del motor. Si algo de aquí se rompe, se filtran
// datos entre dominios o hacia el proveedor del modelo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedDomains,
  buildAliasMap,
  buildContext,
  pseudonymize,
  restore,
  MAX_FACTS
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

test("buildAliasMap: alias estables y numerados por tipo", () => {
  const map = buildAliasMap([
    { kind: "account", name: "BBVA Nómina" },
    { kind: "account", name: "Santander" },
    { kind: "member", name: "Ana" }
  ]);
  assert.strictEqual(map.toAlias.get("BBVA Nómina"), "Cuenta #1");
  assert.strictEqual(map.toAlias.get("Santander"), "Cuenta #2");
  assert.strictEqual(map.toAlias.get("Ana"), "Dependiente #1");
});

test("buildAliasMap: ignora nombres de un solo carácter", () => {
  // Sustituir la letra "a" en todo el texto no protege nada y lo destroza.
  const map = buildAliasMap([{ kind: "account", name: "a" }]);
  assert.strictEqual(map.toAlias.size, 0);
});

test("pseudonymize: sustituye el nombre largo antes que el corto", () => {
  const map = buildAliasMap([
    { kind: "member", name: "Ana" },
    { kind: "member", name: "Ana María" }
  ]);
  const salida = pseudonymize("Ana María gastó más que Ana", map);
  assert.ok(!salida.includes("Ana María"), "el nombre largo no debe quedar partido");
  assert.ok(!salida.includes("Ana"), `ningún nombre real debe sobrevivir: ${salida}`);
});

test("pseudonymize + restore: ida y vuelta devuelve el texto original", () => {
  const map = buildAliasMap([{ kind: "account", name: "BBVA Nómina" }]);
  const original = "Transferiste 3000 desde BBVA Nómina";
  assert.strictEqual(restore(pseudonymize(original, map), map), original);
});

test("buildContext: los nombres reales no salen en los hechos ni en los rechazos", () => {
  const map = buildAliasMap([{ kind: "member", name: "Ana" }]);
  const ctx = buildContext({
    scope: "money",
    facts: [fact("m1", "money", 1, "Ana gastó 4000 en Alimentos")],
    previousRejections: [{ status: "Suppressed", text: "No sugerir recortar el gasto de Ana" }],
    aliases: map
  });
  assert.strictEqual(ctx.facts[0].label, "Dependiente #1 gastó 4000 en Alimentos");
  assert.deepStrictEqual(ctx.rejections, ["No sugerir recortar el gasto de Dependiente #1"]);
  assert.ok(!JSON.stringify(ctx).includes("Ana"));
});

test("buildContext: sin mapa de alias el texto pasa tal cual", () => {
  const ctx = buildContext({ scope: "money", facts: [fact("m1", "money", 1, "Alimentos: 8400")] });
  assert.strictEqual(ctx.facts[0].label, "Alimentos: 8400");
});
