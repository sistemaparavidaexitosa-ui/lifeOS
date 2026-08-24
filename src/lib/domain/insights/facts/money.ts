// src/lib/domain/insights/facts/money.ts
// Extractor de hechos de Money OS — función pura: sin Supabase, sin red, sin
// `new Date()`. La fecha de corte entra como parámetro (D-016/D-018).
//
// Toda la aritmética del motor vive en archivos como este. El modelo recibe la
// salida ya calculada y solo la ordena, la conecta y la redacta.

import type { JournalEntryLike } from "../../types.ts";
import { clampWeight, type Fact } from "../types.ts";

export interface BudgetLineLike {
  id: string;
  category: string;
  monthlyCost: number;
  q1Amount: number;
  q2Amount: number;
}

export interface MoneySnapshot {
  budgets: BudgetLineLike[];
  entries: JournalEntryLike[];
  /** `profiles.quincenal_income`. Cero cuando el usuario no lo declaró. */
  quincenalIncome: number;
  /** Primer día del ciclo vigente, en la zona horaria del usuario. */
  cycleFromISO: string;
}

/** Suma lo gastado (montos negativos de las líneas) en un conjunto de asientos. */
function spentIn(entries: JournalEntryLike[], category: string, fromISO: string, toISO: string): number {
  return entries
    .filter(
      (e) =>
        e.status !== "Reversed" &&
        e.type === "expense" &&
        e.category === category &&
        e.date >= fromISO &&
        e.date < toISO
    )
    .reduce((sum, e) => sum + e.lines.reduce((s, l) => s + Math.max(0, -l.amount), 0), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `Alimentos` → `alimentos`; `Casa y hogar` → `casa-y-hogar`. Para ids estables. */
function slug(category: string): string {
  return category
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Categoría que se pasó de su presupuesto mensual.
 *
 * El peso es cuánto se pasó, no cuánto gastó: 50 % por encima pesa 0.5, el
 * doble del presupuesto pesa 1. Un concepto con presupuesto en cero se ignora
 * — no está excedido, está sin presupuestar, que es otra cosa.
 */
function budgetOverrunFacts(snapshot: MoneySnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];
  for (const line of snapshot.budgets) {
    if (line.monthlyCost <= 0) continue;
    const spent = spentIn(snapshot.entries, line.category, snapshot.cycleFromISO, nextDay(todayISO));
    if (spent <= line.monthlyCost) continue;
    const over = round2(spent - line.monthlyCost);
    facts.push({
      id: `budget.overrun.${slug(line.category)}`,
      domain: "money",
      label: `${line.category}: ${round2(spent)} gastado de ${round2(line.monthlyCost)} presupuestado (${over} por encima)`,
      weight: clampWeight(spent / line.monthlyCost - 1),
      refs: [{ table: "budgets", id: line.id }]
    });
  }
  return facts;
}

/**
 * Gasto atípico: el ciclo vigente contra el promedio de los tres ciclos
 * previos de la misma categoría.
 *
 * Dos guardas contra el ruido, que es de lo que muere un motor así:
 *  - sin al menos un ciclo previo con gasto, no hay promedio y no hay hecho;
 *  - por debajo de `MIN_SPIKE_AMOUNT` no se reporta, porque duplicar un gasto
 *    de 40 pesos es cierto y es inútil.
 */
const MIN_SPIKE_AMOUNT = 500;
const SPIKE_RATIO = 1.5;

function spendSpikeFacts(snapshot: MoneySnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];
  const categories = [...new Set(snapshot.entries.filter((e) => e.category).map((e) => e.category as string))];

  for (const category of categories) {
    const current = spentIn(snapshot.entries, category, snapshot.cycleFromISO, nextDay(todayISO));
    if (current < MIN_SPIKE_AMOUNT) continue;

    const previous: number[] = [];
    let windowEnd = snapshot.cycleFromISO;
    for (let i = 0; i < 3; i++) {
      const windowStart = shiftDays(windowEnd, -30);
      previous.push(spentIn(snapshot.entries, category, windowStart, windowEnd));
      windowEnd = windowStart;
    }
    const withSpend = previous.filter((p) => p > 0);
    if (!withSpend.length) continue;

    const average = withSpend.reduce((s, p) => s + p, 0) / withSpend.length;
    if (current < average * SPIKE_RATIO) continue;

    facts.push({
      id: `spend.spike.${slug(category)}`,
      domain: "money",
      label: `${category}: ${round2(current)} en el ciclo vigente contra un promedio de ${round2(average)} en los ciclos previos`,
      // Duplicar el promedio pesa 0.5; triplicarlo, 1.
      weight: clampWeight((current / average - 1) / 2),
      refs: [{ table: "journal_entries", id: category }]
    });
  }
  return facts;
}

/**
 * Ingreso quincenal declarado que no está asignado a ningún concepto del
 * presupuesto. Solo se reporta si sobra más del 5 %: por debajo de eso es
 * redondeo, no una decisión pendiente.
 */
function unassignedIncomeFact(snapshot: MoneySnapshot): Fact[] {
  if (snapshot.quincenalIncome <= 0) return [];
  const monthlyIncome = snapshot.quincenalIncome * 2;
  const assigned = snapshot.budgets.reduce((sum, b) => sum + b.q1Amount + b.q2Amount, 0);
  const unassigned = round2(monthlyIncome - assigned);
  if (unassigned <= 0 || unassigned < monthlyIncome * 0.05) return [];
  return [
    {
      id: "income.unassigned",
      domain: "money",
      label: `${unassigned} de ingreso mensual sin asignar a ningún concepto del presupuesto (ingreso ${round2(monthlyIncome)}, asignado ${round2(assigned)})`,
      weight: clampWeight(unassigned / monthlyIncome),
      refs: [{ table: "profiles", id: "quincenal_income" }]
    }
  ];
}

/** Aritmética de fechas local al módulo: sin `Date.now()`, entra y sale ISO. */
function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextDay(iso: string): string {
  return shiftDays(iso, 1);
}

/** Todos los hechos de money, ordenados de más a menos anómalo. */
export function moneyFacts(snapshot: MoneySnapshot, todayISO: string): Fact[] {
  return [
    ...budgetOverrunFacts(snapshot, todayISO),
    ...spendSpikeFacts(snapshot, todayISO),
    ...unassignedIncomeFact(snapshot)
  ].sort((a, b) => b.weight - a.weight);
}
