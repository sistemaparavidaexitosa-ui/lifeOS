// tests/domain/insights-debt.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { debtFacts, type DebtSnapshot } from "../../src/lib/domain/insights/facts/debt.ts";
import { addDaysISO } from "../../src/lib/domain/datetime.ts";
import type { DebtLike } from "../../src/lib/domain/types.ts";

const HOY = "2026-08-23";

function deuda(id: string, over: Partial<DebtLike> = {}): DebtLike {
  // 10 000 al 24 % anual => 200 de interés al mes. Mínimo 600: amortiza rápido.
  return { id, name: `Deuda ${id}`, balance: 10000, rate: 24, minPayment: 600, ...over };
}

function snapshot(over: Partial<DebtSnapshot> = {}): DebtSnapshot {
  return { debts: [], payments: [], ...over };
}

test("debtFacts: sin deudas no inventa nada", () => {
  assert.deepStrictEqual(debtFacts(snapshot(), HOY), []);
});

test("debtFacts: una deuda sana y corta no produce ningún hecho", () => {
  assert.deepStrictEqual(debtFacts(snapshot({ debts: [deuda("d1")] }), HOY), []);
});

test("debtFacts: un mínimo que no cubre el interés se reporta como saldo que SUBE", () => {
  // 10 000 al 24 % = 200/mes de interés; mínimo 150.
  const facts = debtFacts(snapshot({ debts: [deuda("d1", { name: "Tarjeta", minPayment: 150 })] }), HOY);
  const nunca = facts.find((f) => f.id === "debt.min-never-amortizes.d1");
  assert.ok(nunca);
  assert.match(nunca.label, /el pago mínimo de 150 no cubre los 200 de interés/);
  assert.match(nunca.label, /el saldo sube en vez de bajar/);
  assert.strictEqual(nunca.weight, 1, "es el peor hecho posible del módulo");
});

test("debtFacts: el caso patológico NO se cuenta también como horizonte largo", () => {
  const facts = debtFacts(snapshot({ debts: [deuda("d1", { minPayment: 150 })] }), HOY);
  assert.strictEqual(facts.filter((f) => f.id.startsWith("debt.min-")).length, 1, "un solo hecho, no dos");
  assert.strictEqual(facts.find((f) => f.id === "debt.min-only-horizon.d1"), undefined);
});

test("debtFacts: un mínimo justo por encima del interés amortiza, y se cuenta el horizonte", () => {
  // Interés 200/mes, mínimo 210: tarda muchísimo pero termina.
  const facts = debtFacts(snapshot({ debts: [deuda("d1", { minPayment: 210 })] }), HOY);
  assert.strictEqual(facts.find((f) => f.id === "debt.min-never-amortizes.d1"), undefined);
  const horizonte = facts.find((f) => f.id === "debt.min-only-horizon.d1");
  assert.ok(horizonte);
  assert.match(horizonte.label, /pagando solo el mínimo de 210 al mes/);
});

test("debtFacts: por debajo de tres años el horizonte no se reporta", () => {
  // Mínimo 600 sobre 10 000: menos de dos años.
  assert.strictEqual(
    debtFacts(snapshot({ debts: [deuda("d1")] }), HOY).find((f) => f.id === "debt.min-only-horizon.d1"),
    undefined
  );
});

test("debtFacts: cuanto más largo el horizonte, más pesa", () => {
  const pesoDe = (min: number) =>
    debtFacts(snapshot({ debts: [deuda("d1", { minPayment: min })] }), HOY).find(
      (f) => f.id === "debt.min-only-horizon.d1"
    )?.weight ?? 0;
  assert.ok(pesoDe(210) > pesoDe(280));
});

test("debtFacts: una tasa muy por encima de la siguiente se señala, con la distancia", () => {
  const facts = debtFacts(
    snapshot({
      debts: [deuda("d1", { name: "Cara", rate: 60, minPayment: 5000 }), deuda("d2", { name: "Barata", rate: 12, minPayment: 5000 })]
    }),
    HOY
  );
  const outlier = facts.find((f) => f.id === "debt.rate-outlier.d1");
  assert.ok(outlier);
  assert.match(outlier.label, /"Cara" está al 60 % anual, 48 puntos por encima/);
  assert.match(outlier.label, /"Barata", al 12 %/);
});

test("debtFacts: tasas parecidas no producen hecho — la distancia es lo que decide", () => {
  const facts = debtFacts(
    snapshot({ debts: [deuda("d1", { rate: 24, minPayment: 5000 }), deuda("d2", { rate: 22, minPayment: 5000 })] }),
    HOY
  );
  assert.strictEqual(facts.filter((f) => f.id.startsWith("debt.rate-outlier")).length, 0);
});

test("debtFacts: con una sola deuda, 'la de mayor tasa' no es un hallazgo", () => {
  const facts = debtFacts(snapshot({ debts: [deuda("d1", { rate: 99, minPayment: 5000 })] }), HOY);
  assert.strictEqual(facts.filter((f) => f.id.startsWith("debt.rate-outlier")).length, 0);
});

test("debtFacts: una deuda con pagos previos y 45 días de silencio se reporta", () => {
  const facts = debtFacts(
    snapshot({
      debts: [deuda("d1", { name: "Auto", minPayment: 5000 })],
      payments: [
        { debtId: "d1", date: addDaysISO(HOY, -200) },
        { debtId: "d1", date: addDaysISO(HOY, -60) }
      ]
    }),
    HOY
  );
  const silencio = facts.find((f) => f.id === "debt.silent.d1");
  assert.ok(silencio);
  assert.match(silencio.label, /no registra ningún pago desde hace 60 días/);
  assert.match(silencio.label, /que el pago no se hiciera o que no se anotara/);
});

test("debtFacts: quien NUNCA ligó un pago no lleva sus cuentas así, y no se le avisa", () => {
  const facts = debtFacts(snapshot({ debts: [deuda("d1", { minPayment: 5000 })], payments: [] }), HOY);
  assert.strictEqual(facts.find((f) => f.id === "debt.silent.d1"), undefined);
});

test("debtFacts: un pago reciente deja la deuda en paz", () => {
  const facts = debtFacts(
    snapshot({
      debts: [deuda("d1", { minPayment: 5000 })],
      payments: [{ debtId: "d1", date: addDaysISO(HOY, -10) }]
    }),
    HOY
  );
  assert.strictEqual(facts.find((f) => f.id === "debt.silent.d1"), undefined);
});

test("debtFacts: el pago de OTRA deuda no cuenta como pago de esta", () => {
  const facts = debtFacts(
    snapshot({
      debts: [deuda("d1", { minPayment: 5000 })],
      payments: [
        { debtId: "d1", date: addDaysISO(HOY, -90) },
        { debtId: "d2", date: addDaysISO(HOY, -1) }
      ]
    }),
    HOY
  );
  assert.ok(facts.find((f) => f.id === "debt.silent.d1"), "el pago de d2 no salva a d1");
});

test("debtFacts: una deuda saldada no genera ningún hecho", () => {
  const facts = debtFacts(
    snapshot({
      debts: [deuda("d1", { balance: 0, minPayment: 1 })],
      payments: [{ debtId: "d1", date: addDaysISO(HOY, -300) }]
    }),
    HOY
  );
  assert.deepStrictEqual(facts, []);
});

test("debtFacts: todo hecho declara su dominio, refs y un peso entre 0 y 1", () => {
  const facts = debtFacts(
    snapshot({
      debts: [
        deuda("d1", { name: "Cara", rate: 60, minPayment: 150 }),
        deuda("d2", { name: "Larga", rate: 10, minPayment: 210 })
      ],
      payments: [{ debtId: "d2", date: addDaysISO(HOY, -120) }]
    }),
    HOY
  );
  assert.ok(facts.length >= 3);
  for (const f of facts) {
    assert.strictEqual(f.domain, "debt");
    assert.ok(f.weight >= 0 && f.weight <= 1, `peso fuera de rango en ${f.id}: ${f.weight}`);
    assert.ok(f.refs.length > 0, `hecho sin refs: ${f.id}`);
  }
});

test("debtFacts: los hechos salen ordenados de más a menos anómalo", () => {
  const facts = debtFacts(
    snapshot({
      debts: [
        deuda("d1", { name: "Cara", rate: 60, minPayment: 150 }),
        deuda("d2", { name: "Larga", rate: 10, minPayment: 210 })
      ],
      payments: [{ debtId: "d2", date: addDaysISO(HOY, -120) }]
    }),
    HOY
  );
  for (let i = 1; i < facts.length; i++) {
    assert.ok((facts[i - 1]?.weight ?? 0) >= (facts[i]?.weight ?? 0));
  }
  assert.strictEqual(facts[0]?.id, "debt.min-never-amortizes.d1", "el saldo que crece va siempre primero");
});
