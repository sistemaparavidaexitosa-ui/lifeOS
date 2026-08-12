// Simuladores de deuda — FR-DEB-002/004/005/006/008, BR-024, NG-003.
// Ninguna función de este módulo ejecuta pagos reales; solo calcula
// escenarios. Los pagos reales se registran vía Ledger (FR-DEB-006).

import type { DebtLike } from "./types.ts";
import { round2 } from "./budget.ts";

export type DebtMethod = "avalanche" | "snowball" | "cashflow" | "ai";

function orderNames(debts: DebtLike[], method: DebtMethod): string[] {
  const rows = [...debts];
  if (method === "snowball") return rows.sort((a, b) => a.balance - b.balance).map((d) => d.name);
  if (method === "cashflow") return rows.sort((a, b) => a.minPayment - b.minPayment).map((d) => d.name);
  return rows.sort((a, b) => b.rate - a.rate).map((d) => d.name); // avalanche (y base de "ai")
}

export interface SimulationResult {
  method: DebtMethod;
  months: number;
  interest: number;
  order: string[];
  chosen?: DebtMethod;
  rationale?: string;
}

function runSimulation(debts: DebtLike[], method: DebtMethod, extraMonthly: number): { months: number; interest: number } {
  const working = debts.map((d) => ({ name: d.name, balance: d.balance, rate: d.rate / 100 / 12, min: d.minPayment }));
  if (working.length === 0) return { months: 0, interest: 0 };
  const order = orderNames(debts, method);
  const sortByOrder = (a: { name: string }, b: { name: string }) => order.indexOf(a.name) - order.indexOf(b.name);
  let months = 0;
  let interest = 0;
  let guard = 0;
  while (working.some((d) => d.balance > 0.01) && guard < 600) {
    guard++;
    months++;
    let pool = extraMonthly;
    for (const d of working) {
      if (d.balance <= 0) continue;
      const i = d.balance * d.rate;
      interest += i;
      d.balance += i;
    }
    for (const d of working) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.balance, d.min);
      d.balance -= pay;
    }
    for (const d of [...working].filter((x) => x.balance > 0).sort(sortByOrder)) {
      if (pool <= 0) break;
      const pay = Math.min(d.balance, pool);
      d.balance -= pay;
      pool -= pay;
    }
  }
  return { months, interest: round2(interest) };
}

/**
 * FR-DEB-005: "IA Optimizada" es una recomendación EXPLICABLE que compara los
 * tres métodos deterministas y elige el de menor interés total. No ejecuta
 * pagos (FR-INT-008).
 */
export function simulateDebt(debts: DebtLike[], method: DebtMethod, extraMonthly: number): SimulationResult {
  if (method === "ai") {
    const candidates: { m: Exclude<DebtMethod, "ai">; r: { months: number; interest: number } }[] = (
      ["avalanche", "snowball", "cashflow"] as const
    ).map((m) => ({ m, r: runSimulation(debts, m, extraMonthly) }));
    candidates.sort((a, b) => a.r.interest - b.r.interest);
    const best = candidates[0]!;
    const names: Record<string, string> = { avalanche: "Avalancha", snowball: "Bola de nieve", cashflow: "Cash Flow First" };
    return {
      method: "ai",
      months: best.r.months,
      interest: best.r.interest,
      order: orderNames(debts, best.m),
      chosen: best.m,
      rationale: `IA Optimizada: se eligió "${names[best.m]}" por menor interés total. Recomendación explicable; no ejecuta pagos (FR-DEB-005/FR-INT-008).`
    };
  }
  const r = runSimulation(debts, method, extraMonthly);
  return { method, months: r.months, interest: r.interest, order: orderNames(debts, method) };
}

/** FR-DEB-008: simulador editable por deuda específica (meses, monto aportado). */
export function simulateSingleDebt(debt: DebtLike, monthlyAmount: number): { months: number; interest: number } {
  let balance = debt.balance;
  const rate = debt.rate / 100 / 12;
  let months = 0;
  let interest = 0;
  let guard = 0;
  while (balance > 0.01 && guard < 600) {
    guard++;
    months++;
    const i = balance * rate;
    interest += i;
    balance += i;
    const pay = Math.min(balance, Math.max(monthlyAmount, debt.minPayment));
    balance -= pay;
  }
  return { months, interest: round2(interest) };
}
