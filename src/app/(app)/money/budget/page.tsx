import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
import { money0 } from "@/lib/format";
import { budgetTabRow } from "@/lib/domain/budget.ts";
import { accountBalance } from "@/lib/domain/money.ts";
import { addDaysISO, todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import BudgetLineForm from "./BudgetLineForm";
import QuincenalIncomeForm from "./QuincenalIncomeForm";
import CreateBudgetButton from "./CreateBudgetButton";
import { getSessionUser } from "@/lib/data/session";

// PUNTO 4: la columna "Balance" ahora es GASTO − COSTO MENSUAL por ítem
// (row.expenseVsBudget). Antes reflejaba de facto solo las aportaciones porque
// el gasto no se contabilizaba (solo se contaba status='Reconciled', y los
// movimientos se registran como 'Posted'). Ahora budgetTabRow cuenta
// Posted + Reconciled y expone expenseVsBudget para esta columna.
export default async function BudgetTabPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: budgets }, { data: categories }, { data: expenseEntries }, { data: accounts }, { data: allEntries }] =
    await Promise.all([
      supabase.from("profiles").select("currency, locale, quincenal_income").eq("user_id", user.id).single(),
      supabase.from("budgets").select("*").eq("period", "current"),
      supabase.from("categories").select("name"),
      supabase.from("journal_entries").select("*, journal_lines(*)").eq("type", "expense"),
      supabase.from("accounts").select("id, opening_balance"),
      supabase.from("journal_entries").select("*, journal_lines(*)")
    ]);

  if (!profile) throw new Error("Perfil no encontrado.");

  const from15 = addDaysISO(todayLocal(await getUserTimeZone()), -15);

  const entriesForDomain = (expenseEntries ?? []).map((e) => ({
    id: e.id,
    type: e.type as "income" | "expense" | "transfer",
    date: e.entry_date,
    category: e.category,
    status: e.status as "Posted" | "Reconciled" | "Reversed",
    lines: (e.journal_lines ?? []).map((l) => ({ account: l.account_id, amount: l.amount }))
  }));

  const rows = (budgets ?? []).map((b) =>
    budgetTabRow({ id: b.id, category: b.category, monthlyCost: b.monthly_cost, q1Amount: b.q1_amount, q2Amount: b.q2_amount }, entriesForDomain, from15)
  );

  const categoryNames = (categories ?? []).map((c) => c.name);

  const totals = rows.reduce(
    (acc, r) => ({
      monthlyCost: acc.monthlyCost + r.monthlyCost,
      q1: acc.q1 + r.q1Amount,
      q2: acc.q2 + r.q2Amount,
      spent: acc.spent + r.spent,
      balanceCol: acc.balanceCol + r.expenseVsBudget
    }),
    { monthlyCost: 0, q1: 0, q2: 0, spent: 0, balanceCol: 0 }
  );

  const income = profile.quincenal_income ?? 0;
  const diffQ1 = income - totals.q1;
  const diffQ2 = income - totals.q2;

  // Conciliación: ¿la liquidez real disponible en cuentas alcanza para cubrir
  // el costo mensual total del presupuesto? Reutiliza accountBalance() (misma
  // función usada en /money y /debt).
  const allEntriesForDomain = (allEntries ?? []).map((e) => ({
    id: e.id,
    type: e.type as "income" | "expense" | "transfer",
    date: e.entry_date,
    category: e.category,
    status: e.status as "Posted" | "Reconciled" | "Reversed",
    lines: (e.journal_lines ?? []).map((l) => ({ account: l.account_id, amount: l.amount }))
  }));
  const liquidity = (accounts ?? []).reduce((sum, a) => sum + accountBalance(a.id, a.opening_balance, allEntriesForDomain), 0);
  const liquidityGap = liquidity - totals.monthlyCost;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className="text-sm p-2.5 rounded-r-xl"
        style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))", borderLeft: "3px solid var(--accent)" }}
      >
        Pestaña dedicada de Presupuesto: concepto, costo mensual, aportación Quincena 1, aportación Quincena 2 y balance
        (FR-MNY-018/019).
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <h3 className="font-bold">Ingreso quincenal</h3>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Se usa para calcular la diferencia si tus aportaciones Q1/Q2 exceden el ingreso disponible.
            </p>
          </div>
          <b className="text-xl">{money0(income, profile.currency, profile.locale)}</b>
        </div>
        <QuincenalIncomeForm income={income} />
        {income > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="stat card" style={{ padding: 15 }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Diferencia Quincena 1
              </span>
              <b className="block text-lg" style={{ color: diffQ1 < 0 ? "var(--danger)" : "var(--ok)" }}>
                {money0(diffQ1, profile.currency, profile.locale)}
              </b>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {diffQ1 < 0 ? "Excede tu ingreso quincenal" : "Dentro de tu ingreso quincenal"}
              </span>
            </div>
            <div className="stat card" style={{ padding: 15 }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Diferencia Quincena 2
              </span>
              <b className="block text-lg" style={{ color: diffQ2 < 0 ? "var(--danger)" : "var(--ok)" }}>
                {money0(diffQ2, profile.currency, profile.locale)}
              </b>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {diffQ2 < 0 ? "Excede tu ingreso quincenal" : "Dentro de tu ingreso quincenal"}
              </span>
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 className="font-bold">Conceptos del presupuesto</h3>
        <div className="flex items-center gap-2" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!rows.length && <CreateBudgetButton existingCategories={categoryNames} hasIncome={income > 0} />}
          {rows.length > 0 && <BudgetLineForm existingCategories={categoryNames} />}
        </div>
      </div>

      <Card className="overflow-auto">
        {!rows.length ? (
          <EmptyState icon="🧾" text="Crea tu presupuesto para empezar a llevar el control de tus conceptos." />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--muted)" }} className="text-left">
                  <th className="pb-2">Concepto</th>
                  <th>Costo mensual</th>
                  <th>Aportación Q1</th>
                  <th>Aportación Q2</th>
                  <th>Gasto</th>
                  <th>Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="py-2">
                      <b>{r.category}</b>
                    </td>
                    <td>{money0(r.monthlyCost, profile.currency, profile.locale)}</td>
                    <td>{money0(r.q1Amount, profile.currency, profile.locale)}</td>
                    <td>{money0(r.q2Amount, profile.currency, profile.locale)}</td>
                    <td>{money0(r.spent, profile.currency, profile.locale)}</td>
                    {/* PUNTO 4: Balance = gasto − costo mensual. Positivo = excediste el costo mensual (rojo). */}
                    <td style={{ color: r.expenseVsBudget > 0 ? "var(--danger)" : "var(--ok)" }}>
                      {money0(r.expenseVsBudget, profile.currency, profile.locale)}
                    </td>
                    <td>
                      <BudgetLineForm line={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Total mensual</span>
                <b className="block text-lg">{money0(totals.monthlyCost, profile.currency, profile.locale)}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Total gastado</span>
                <b className="block text-lg">{money0(totals.spent, profile.currency, profile.locale)}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Total Q1</span>
                <b className="block text-lg">{money0(totals.q1, profile.currency, profile.locale)}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Balance total</span>
                <b className="block text-lg" style={{ color: totals.balanceCol > 0 ? "var(--danger)" : "var(--ok)" }}>
                  {money0(totals.balanceCol, profile.currency, profile.locale)}
                </b>
              </div>
            </div>
          </>
        )}
      </Card>

      {rows.length > 0 && (
        <Card>
          <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h3 className="font-bold">Conciliación con cuentas</h3>
            <span className={`chip ${liquidityGap < 0 ? "bad" : "ok"}`}>{liquidityGap < 0 ? "Excede lo disponible" : "Conciliado"}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div className="stat card" style={{ padding: 15 }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Disponible en cuentas</span>
              <b className="block text-lg">{money0(liquidity, profile.currency, profile.locale)}</b>
            </div>
            <div className="stat card" style={{ padding: 15 }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Costo mensual total</span>
              <b className="block text-lg">{money0(totals.monthlyCost, profile.currency, profile.locale)}</b>
            </div>
            <div className="stat card" style={{ padding: 15 }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Diferencia</span>
              <b className="block text-lg" style={{ color: liquidityGap < 0 ? "var(--danger)" : "var(--ok)" }}>
                {money0(liquidityGap, profile.currency, profile.locale)}
              </b>
            </div>
          </div>
          {liquidityGap < 0 && (
            <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>
              El costo mensual de tu presupuesto supera el dinero disponible en tus cuentas. Revisa tus conceptos o
              registra los movimientos pendientes en Dashboard y Gastos.
            </p>
          )}
        </Card>
      )}

      <div
        className="text-xs p-2.5 rounded-r-xl"
        style={{ background: "color-mix(in srgb, var(--info) 9%, var(--surface))", borderLeft: "3px solid var(--info)" }}
      >
        Balance = gasto del concepto en el ciclo vigente − costo mensual planeado (PUNTO 4). Un balance positivo indica que
        ya excediste el costo mensual; uno negativo, que aún te queda margen. Se cuentan los movimientos de gasto Posted y
        Reconciled de ese concepto (se excluyen los revertidos).
      </div>
    </div>
  );
}
