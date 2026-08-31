import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, Chip, Progress } from "@/components/ui";
import { money0 } from "@/lib/format";
import {
  budgetTabRow,
  budgetQuincenaRow,
  carryoverOffered,
  totalSpentInRange,
  totalIncomeInRange,
  round2
} from "@/lib/domain/budget.ts";
import { quincenaFor, quincenaFromKey, shiftQuincena, monthRangeOf } from "@/lib/domain/quincena.ts";
import { accountBalance } from "@/lib/domain/money.ts";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import BudgetLineForm from "./BudgetLineForm";
import QuincenalIncomeForm from "./QuincenalIncomeForm";
import CreateBudgetButton from "./CreateBudgetButton";
import QuincenaSwitcher from "./QuincenaSwitcher";
import CarryoverButton from "./CarryoverButton";
import { getSessionUser } from "@/lib/data/session";

// D-076: esta pestaña se TRABAJA POR QUINCENA y se RESUME por mes.
//
// Antes medía el gasto en una ventana RODANTE de 15 días (`hoy − 15`) y lo
// comparaba contra el costo MENSUAL: el usuario veía un acumulado Q1+Q2, la
// columna "Balance" casi siempre salía en verde aunque la quincena estuviera
// agotada, y las aportaciones Q1/Q2 no medían nada — eran sólo plan.
//
// Ahora la quincena es un periodo cerrado (Q1 = 1-15, Q2 = 16-fin de mes,
// src/lib/domain/quincena.ts), se navega por el querystring `?q=2026-08-Q2`, y
// el arrastre entre quincenas sólo entra si el usuario lo aplica.
export default async function BudgetTabPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { q: requestedQuincena } = await searchParams;
  const today = todayLocal(await getUserTimeZone());
  const currentQuincena = quincenaFor(today);
  // Una clave manipulada en la URL no debe tumbar la página: se cae a la vigente.
  const quincena = (requestedQuincena ? quincenaFromKey(requestedQuincena) : null) ?? currentQuincena;
  const previousQuincena = shiftQuincena(quincena, -1);
  const month = monthRangeOf(quincena);

  const [{ data: profile }, { data: budgets }, { data: categories }, { data: accounts }, { data: allEntries }, { data: carryovers }] =
    await Promise.all([
      supabase.from("profiles").select("currency, locale, quincenal_income").eq("user_id", user.id).single(),
      supabase.from("budgets").select("*").eq("period", "current"),
      supabase.from("categories").select("name"),
      supabase.from("accounts").select("id, opening_balance"),
      supabase.from("journal_entries").select("*, journal_lines(*)"),
      supabase.from("budget_carryovers").select("budget_id, period_key, amount").in("period_key", [quincena.key, previousQuincena.key])
    ]);

  if (!profile) throw new Error("Perfil no encontrado.");
  const { currency, locale } = profile;
  const fmt = (n: number) => money0(n, currency, locale);

  const entries = (allEntries ?? []).map((e) => ({
    id: e.id,
    type: e.type as "income" | "expense" | "transfer",
    date: e.entry_date,
    category: e.category,
    status: e.status as "Posted" | "Reconciled" | "Reversed",
    lines: (e.journal_lines ?? []).map((l) => ({ account: l.account_id, amount: l.amount }))
  }));

  const lines = (budgets ?? []).map((b) => ({
    id: b.id,
    category: b.category,
    monthlyCost: b.monthly_cost,
    q1Amount: b.q1_amount,
    q2Amount: b.q2_amount
  }));
  const createdAtById = new Map((budgets ?? []).map((b) => [b.id, b.created_at]));

  const appliedIn = (periodKey: string, budgetId: string): number | null => {
    const hit = (carryovers ?? []).find((c) => c.period_key === periodKey && c.budget_id === budgetId);
    return hit ? hit.amount : null;
  };

  // Cada concepto en la quincena vista, más el cierre de la anterior (lo que se
  // le OFRECE arrastrar). El cierre anterior contempla a su vez el arrastre que
  // el usuario le hubiera aplicado a esa quincena.
  const rows = lines.map((line) => {
    const applied = appliedIn(quincena.key, line.id);
    return {
      ...budgetQuincenaRow(line, entries, quincena, applied ?? 0),
      line,
      applied,
      offered: carryoverOffered(
        line,
        entries,
        previousQuincena,
        appliedIn(previousQuincena.key, line.id) ?? 0,
        createdAtById.get(line.id) ?? ""
      )
    };
  });

  const income = profile.quincenal_income ?? 0;
  const assigned = round2(rows.reduce((s, r) => s + r.available, 0));
  const spentInBudget = round2(rows.reduce((s, r) => s + r.spent, 0));
  const spentTotal = totalSpentInRange(entries, quincena);
  const spentOutside = round2(spentTotal - spentInBudget);
  const registeredIncome = totalIncomeInRange(entries, quincena);
  const availableNow = round2(income - spentTotal);

  // Gasto de la quincena en categorías SIN concepto de presupuesto: es dinero que
  // se está yendo del plan sin que el plan lo vea, así que se nombra y se ofrece
  // crear el concepto que falta.
  const budgetedCategories = new Set(lines.map((l) => l.category));
  const outsideByCategory = new Map<string, number>();
  for (const e of entries) {
    if (e.status === "Reversed" || e.type !== "expense") continue;
    if (e.date < quincena.fromISO || e.date > quincena.toISO) continue;
    if (e.category && budgetedCategories.has(e.category)) continue;
    const name = e.category ?? "Sin categoría";
    const amount = e.lines.reduce((s, l) => s + Math.max(0, -l.amount), 0);
    outsideByCategory.set(name, round2((outsideByCategory.get(name) ?? 0) + amount));
  }
  const outsideRows = [...outsideByCategory.entries()].sort((a, b) => b[1] - a[1]);

  // Resumen del mes: mismas líneas, ventana mensual completa (Q1 + Q2).
  const monthRows = lines.map((line) => budgetTabRow(line, entries, month));
  const monthTotals = monthRows.reduce(
    (acc, r) => ({ monthlyCost: acc.monthlyCost + r.monthlyCost, spent: acc.spent + r.spent }),
    { monthlyCost: 0, spent: 0 }
  );

  const liquidity = (accounts ?? []).reduce((sum, a) => sum + accountBalance(a.id, a.opening_balance, entries), 0);
  const liquidityGap = round2(liquidity - monthTotals.monthlyCost);
  const categoryNames = (categories ?? []).map((c) => c.name);
  const pctSpent = income > 0 ? Math.round((spentTotal / income) * 100) : 0;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 className="font-bold">Presupuesto por quincena</h3>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {quincena.fromISO} al {quincena.toISO}
            {quincena.key === currentQuincena.key ? " · quincena en curso" : ""}
          </p>
        </div>
        <QuincenaSwitcher current={quincena} isCurrent={quincena.key === currentQuincena.key} />
      </div>

      {/* --------------------------------------------------------------------
          Panel de la quincena: la pregunta que el usuario hace todos los días
          ("¿cuánto llevo gastado de ESTA quincena?") contestada arriba del todo.
      --------------------------------------------------------------------- */}
      <Card>
        <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3 className="font-bold">{quincena.label}</h3>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Tu ingreso quincenal es la base del plan; el gasto se cuenta conforme registras movimientos.
            </p>
          </div>
          <QuincenalIncomeForm income={income} />
        </div>

        {income <= 0 ? (
          <EmptyState icon="💵" text="Declara tu ingreso quincenal para ver cómo va el gasto de la quincena." />
        ) : (
          <>
            <div className="grid gap-3 mt-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Ingreso quincenal</span>
                <b className="block text-lg">{fmt(income)}</b>
                {registeredIncome > 0 && Math.abs(registeredIncome - income) >= 1 && (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Registrado en movimientos: {fmt(registeredIncome)}</span>
                )}
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Gastado</span>
                <b className="block text-lg">{fmt(spentTotal)}</b>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {fmt(spentInBudget)} en presupuesto · {fmt(spentOutside)} fuera
                </span>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Disponible</span>
                <b className="block text-lg" style={{ color: availableNow < 0 ? "var(--danger)" : "var(--ok)" }}>{fmt(availableNow)}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Sin asignar a conceptos</span>
                <b className="block text-lg" style={{ color: income - assigned < 0 ? "var(--danger)" : undefined }}>{fmt(round2(income - assigned))}</b>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Asignado: {fmt(assigned)}</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs" style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}>
                <span>Consumo de la quincena</span>
                <span>{pctSpent}%</span>
              </div>
              <Progress pct={pctSpent} kind={pctSpent >= 100 ? "bad" : pctSpent >= 85 ? "warn" : undefined} />
            </div>
          </>
        )}
      </Card>

      <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 className="font-bold">Conceptos · {quincena.label}</h3>
        <div className="flex items-center gap-2" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!rows.length && <CreateBudgetButton existingCategories={categoryNames} hasIncome={income > 0} />}
          {rows.length > 0 && <BudgetLineForm existingCategories={categoryNames} />}
        </div>
      </div>

      <Card className="overflow-auto">
        {!rows.length ? (
          <EmptyState icon="🧾" text="Crea tu presupuesto para empezar a llevar el control de tus conceptos." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }} className="text-left">
                <th className="pb-2">Concepto</th>
                <th>Aportación</th>
                <th>Arrastre de Q{previousQuincena.half}</th>
                <th>Disponible</th>
                <th>Gastado</th>
                <th>Restante</th>
                <th style={{ minWidth: 120 }}>Consumo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="py-2">
                    <b>{r.category}</b>
                  </td>
                  <td>{fmt(r.planned)}</td>
                  <td>
                    <CarryoverButton
                      budgetId={r.id}
                      periodKey={quincena.key}
                      offered={r.offered}
                      applied={r.applied}
                      currency={currency}
                      locale={locale}
                    />
                  </td>
                  <td>{fmt(r.available)}</td>
                  <td>{fmt(r.spent)}</td>
                  {/* Un solo significado de "restante": disponible − gasto. Positivo = te queda. */}
                  <td style={{ color: r.remaining < 0 ? "var(--danger)" : "var(--ok)", fontWeight: 700 }}>{fmt(r.remaining)}</td>
                  <td>
                    <Progress pct={r.pct} kind={r.status === "over" ? "bad" : r.status === "warn" ? "warn" : undefined} />
                    <Chip kind={r.status === "over" ? "bad" : r.status === "warn" ? "warn" : "ok"}>
                      {r.status === "over" ? "Excedido" : r.status === "warn" ? "Al límite" : `${r.pct}%`}
                    </Chip>
                  </td>
                  <td>
                    <BudgetLineForm line={r.line} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* --------------------------------------------------------------------
          Gasto sin concepto: cuenta en el total de la quincena (por eso el
          número de arriba no miente) pero se nombra aparte para poder corregirlo.
      --------------------------------------------------------------------- */}
      {outsideRows.length > 0 && (
        <Card>
          <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h3 className="font-bold">Fuera de presupuesto · {fmt(spentOutside)}</h3>
            <Chip kind="warn">{outsideRows.length} categoría{outsideRows.length === 1 ? "" : "s"}</Chip>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Gasto de esta quincena en categorías que no tienen concepto en tu presupuesto. Sí cuenta en el total de arriba.
          </p>
          {outsideRows.map(([category, amount]) => (
            <div key={category} className="flex items-center justify-between py-2" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", gap: 8 }}>
              <div>
                <b>{category}</b>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{fmt(amount)} en esta quincena</div>
              </div>
              {category !== "Sin categoría" && (
                <BudgetLineForm existingCategories={categoryNames} defaultCategory={category} label="+ Crear concepto" />
              )}
            </div>
          ))}
        </Card>
      )}

      {/* --------------------------------------------------------------------
          Resumen del mes: Q1 + Q2 completas contra el costo mensual planeado.
      --------------------------------------------------------------------- */}
      {rows.length > 0 && (
        <Card>
          <h3 className="font-bold">Resumen del mes ({month.fromISO.slice(0, 7)})</h3>
          <div className="grid gap-3 mt-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div className="stat card" style={{ padding: 15 }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Costo mensual total</span>
              <b className="block text-lg">{fmt(monthTotals.monthlyCost)}</b>
            </div>
            <div className="stat card" style={{ padding: 15 }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Gastado en el mes</span>
              <b className="block text-lg">{fmt(monthTotals.spent)}</b>
            </div>
            <div className="stat card" style={{ padding: 15 }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Restante del mes</span>
              <b className="block text-lg" style={{ color: monthTotals.monthlyCost - monthTotals.spent < 0 ? "var(--danger)" : "var(--ok)" }}>
                {fmt(round2(monthTotals.monthlyCost - monthTotals.spent))}
              </b>
            </div>
            <div className="stat card" style={{ padding: 15 }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Disponible en cuentas</span>
              <b className="block text-lg">{fmt(liquidity)}</b>
              <span className="text-xs" style={{ color: liquidityGap < 0 ? "var(--danger)" : "var(--muted)" }}>
                {liquidityGap < 0 ? `Faltan ${fmt(Math.abs(liquidityGap))} para cubrir el mes` : "Conciliado con el costo mensual"}
              </span>
            </div>
          </div>
        </Card>
      )}

      <div
        className="text-xs p-2.5 rounded-r-xl"
        style={{ background: "color-mix(in srgb, var(--info) 9%, var(--surface))", borderLeft: "3px solid var(--info)" }}
      >
        Q1 va del día 1 al 15 y Q2 del 16 al fin de mes (D-076). Cada quincena arranca con su aportación limpia: el sobrante
        o el exceso de la anterior se te muestra, pero sólo entra si tú lo aplicas, concepto por concepto, y lo puedes
        quitar. Se cuentan los movimientos Posted y Reconciled; los revertidos no.
      </div>
    </div>
  );
}
