import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, Progress, EmptyState } from "@/components/ui";
import { money, money0, fdate } from "@/lib/format";
import { accountBalance, periodStats } from "@/lib/domain/money.ts";
import { budgetQuincenaRow } from "@/lib/domain/budget.ts";
import { quincenaFor } from "@/lib/domain/quincena.ts";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { todayInTimeZone } from "@/lib/domain/datetime.ts";
import NewTransactionForm from "./NewTransactionForm";
import NewAccountForm from "./NewAccountForm";
import TxnRowActions from "./TxnRowActions";
import InsightSection from "@/components/InsightSection";
import { getSessionUser } from "@/lib/data/session";

export default async function MoneyPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const t0 = todayLocal(await getUserTimeZone());
  // D-076: el periodo de Money OS es la QUINCENA en curso (Q1 = 1-15, Q2 = 16-fin
  // de mes), no una ventana rodante de 15 días. Antes esta página y /money/budget
  // medían periodos distintos y no cuadraban entre sí.
  const quincena = quincenaFor(t0);

  const [{ data: profile }, { data: accounts }, { data: entries }, { data: budgets }, { data: carryovers }, { data: categories }, { data: debts }, { data: familyMembers }] =
    await Promise.all([
      supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("journal_entries").select("*, journal_lines(*)").order("entry_date", { ascending: false }),
      supabase.from("budgets").select("*").eq("period", "current"),
      supabase.from("budget_carryovers").select("budget_id, amount").eq("period_key", quincena.key),
      supabase.from("categories").select("name"),
      supabase.from("debts").select("id, name"),
      supabase.from("family_members").select("id, name, relationship")
    ]);

  if (!profile) throw new Error("Perfil no encontrado.");
  const currency = profile.currency;
  const locale = profile.locale;

  const entriesForDomain = (entries ?? []).map((e) => ({
    id: e.id,
    type: e.type as "income" | "expense" | "transfer",
    date: e.entry_date,
    category: e.category,
    status: e.status as "Posted" | "Reconciled" | "Reversed",
    lines: (e.journal_lines ?? []).map((l) => ({ account: l.account_id, amount: l.amount }))
  }));

  const liquidity = (accounts ?? []).reduce((sum, a) => sum + accountBalance(a.id, a.opening_balance, entriesForDomain), 0);
  const stats = periodStats(entriesForDomain, quincena.fromISO, quincena.toISO);

  // Mismo cálculo que /money/budget (budgetQuincenaRow): aportación de ESTA
  // quincena más el arrastre que el usuario aplicó, contra el gasto de ESTA
  // quincena. Antes esta barra usaba `budgets.amount` (monthly_cost/2, un campo
  // heredado) contra un gasto de 15 días rodantes: era quincenal por accidente.
  const budgetRows = (budgets ?? []).map((b) =>
    budgetQuincenaRow(
      { id: b.id, category: b.category, monthlyCost: b.monthly_cost, q1Amount: b.q1_amount, q2Amount: b.q2_amount },
      entriesForDomain,
      quincena,
      (carryovers ?? []).find((c) => c.budget_id === b.id)?.amount ?? 0
    )
  );

  const familyById = new Map((familyMembers ?? []).map((m) => [m.id, m.name]));
  const debtById = new Map((debts ?? []).map((d) => [d.id, d.name]));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid md:grid-cols-2 gap-3.5">
        <Card hero>
          <div className="text-xs" style={{ opacity: 0.85 }}>
            Liquidez total · corte {fdate(todayInTimeZone(await getUserTimeZone()))}
          </div>
          <div className="text-3xl font-black">{money(liquidity, currency, locale)}</div>
          <div className="text-xs p-2 rounded-lg mt-2" style={{ background: "rgba(255,255,255,.14)", border: "1px solid #fff", color: "#fff" }}>
            Ledger de doble partida · las transferencias no cuentan como ingreso ni gasto (BR-002).
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3.5">
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Ingreso ({quincena.label})</span>
            <b className="block text-xl">{money0(stats.income, currency, locale)}</b>
          </div>
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Gasto ({quincena.label})</span>
            <b className="block text-xl">{money0(stats.expense, currency, locale)}</b>
          </div>
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Disponible</span>
            <b className="block text-xl">{money0(stats.available, currency, locale)}</b>
          </div>
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Transferencias</span>
            <b className="block text-xl">{money0(stats.transfers, currency, locale)}</b>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3.5">
        <Card>
          <h3 className="font-bold mb-2">Cuentas</h3>
          {(accounts ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--line)" }}>
              <div>
                <b>{a.name}</b>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {a.type} · {a.currency}
                </div>
              </div>
              <b>{money(accountBalance(a.id, a.opening_balance, entriesForDomain), a.currency, locale)}</b>
            </div>
          ))}
          <NewAccountForm />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-bold">Presupuesto · {quincena.label}</h3>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Gasto de esta quincena contra lo que le asignaste.
              </p>
            </div>
            <Link href="/money/budget" className="btn-ghost btn-sm">
              Ver pestaña completa
            </Link>
          </div>
          {!budgetRows.length && <EmptyState icon="💰" text="Genera tu presupuesto quincenal desde la pestaña de Presupuesto." />}
          {/* PUNTO 3: el resumen de presupuesto ahora es scrollable (no crece indefinidamente). */}
          <div style={{ maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
            {budgetRows.map((r) => (
              <div key={r.id} className="my-2.5">
                <div className="flex justify-between text-sm">
                  <span>{r.category}</span>
                  <span>
                    {money0(r.spent, currency, locale)} / {money0(r.available, currency, locale)}
                  </span>
                </div>
                <Progress pct={r.pct} kind={r.status === "over" ? "bad" : r.status === "warn" ? "warn" : undefined} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <NewTransactionForm
        accounts={accounts ?? []}
        categories={(categories ?? []).map((c) => c.name)}
        debts={debts ?? []}
        familyMembers={familyMembers ?? []}
      />

      <Card className="overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">Movimientos</h3>
          <Chip>{entries?.length ?? 0}</Chip>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--muted)" }} className="text-left">
              <th className="pb-2">Fecha</th>
              <th>Concepto</th>
              <th>Categoría</th>
              <th>Miembro</th>
              <th>Deuda</th>
              <th>Tipo</th>
              <th>Monto</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e) => {
              const amt = (e.journal_lines ?? []).reduce((s, l) => s + (e.type === "transfer" ? Math.max(0, l.amount) : l.amount), 0);
              return (
                <tr key={e.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="py-2" style={{ color: "var(--muted)" }}>
                    {fdate(e.entry_date)}
                  </td>
                  <td>
                    <b>{e.memo}</b>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{e.category ?? "—"}</td>
                  <td>{e.family_member_id ? <Chip kind="purple">{familyById.get(e.family_member_id)}</Chip> : <span className="text-xs" style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td>{e.debt_id ? <Chip kind="info">{debtById.get(e.debt_id)}</Chip> : <span className="text-xs" style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td>
                    <Chip kind={e.type === "income" ? "ok" : e.type === "expense" ? "bad" : "info"}>
                      {e.type === "income" ? "Ingreso" : e.type === "expense" ? "Gasto" : "Transfer."}
                    </Chip>
                  </td>
                  <td style={{ color: amt < 0 ? "var(--danger)" : undefined }}>{money(amt, currency, locale)}</td>
                  <td>
                    <Chip kind={e.status === "Reconciled" ? "ok" : e.status === "Reversed" ? undefined : "warn"}>{e.status}</Chip>
                  </td>
                  <td>
                    <TxnRowActions entryId={e.id} status={e.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <InsightSection scope="money" />
    </div>
  );
}
