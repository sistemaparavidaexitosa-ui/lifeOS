import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
import { money0 } from "@/lib/format";
import { budgetTabRow } from "@/lib/domain/budget.ts";
import { addDaysISO, todayLocal } from "@/lib/data/dates";
import BudgetLineForm from "./BudgetLineForm";

export default async function BudgetTabPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: budgets }, { data: categories }, { data: entries }] = await Promise.all([
    supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
    supabase.from("budgets").select("*").eq("period", "current"),
    supabase.from("categories").select("name"),
    supabase.from("journal_entries").select("*, journal_lines(*)").eq("type", "expense")
  ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  const from15 = addDaysISO(todayLocal(), -15);
  const entriesForDomain = (entries ?? []).map((e) => ({
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
  const usedCategories = new Set((budgets ?? []).map((b) => b.category));
  const availableCategories = (categories ?? []).map((c) => c.name).filter((c) => !usedCategories.has(c));

  const totals = rows.reduce(
    (acc, r) => ({
      monthlyCost: acc.monthlyCost + r.monthlyCost,
      q1: acc.q1 + r.q1Amount,
      q2: acc.q2 + r.q2Amount,
      balance: acc.balance + r.balance
    }),
    { monthlyCost: 0, q1: 0, q2: 0, balance: 0 }
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))", borderLeft: "3px solid var(--accent)" }}>
        Pestaña dedicada de Presupuesto: concepto, costo mensual, aportación Quincena 1, aportación Quincena 2 y balance
        (FR-MNY-018/019).
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Conceptos del presupuesto</h3>
        {availableCategories.length > 0 && <BudgetLineForm categories={availableCategories} />}
      </div>

      <Card className="overflow-auto">
        {!rows.length ? (
          <EmptyState icon="🧾" text="Agrega tu primer concepto de presupuesto." />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--muted)" }} className="text-left">
                  <th className="pb-2">Concepto</th>
                  <th>Costo mensual</th>
                  <th>Aportación Q1</th>
                  <th>Aportación Q2</th>
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
                    <td style={{ color: r.balance < 0 ? "var(--danger)" : "var(--ok)" }}>{money0(r.balance, profile.currency, profile.locale)}</td>
                    <td>
                      <BudgetLineForm line={r} categories={[r.category]} />
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
                <span className="text-xs" style={{ color: "var(--muted)" }}>Total Q1</span>
                <b className="block text-lg">{money0(totals.q1, profile.currency, profile.locale)}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Total Q2</span>
                <b className="block text-lg">{money0(totals.q2, profile.currency, profile.locale)}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Balance total</span>
                <b className="block text-lg" style={{ color: totals.balance < 0 ? "var(--warn)" : undefined }}>
                  {money0(totals.balance, profile.currency, profile.locale)}
                </b>
              </div>
            </div>
          </>
        )}
      </Card>

      <div className="text-xs p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--info) 9%, var(--surface))", borderLeft: "3px solid var(--info)" }}>
        Balance = Costo mensual − gasto conciliado del concepto en el ciclo vigente (BR-028). Un balance negativo indica que
        excediste el costo mensual planeado.
      </div>
    </div>
  );
}
