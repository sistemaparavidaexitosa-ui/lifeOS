import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, Progress, EmptyState } from "@/components/ui";
import { money, money0, fdate } from "@/lib/format";
import { accountBalance, periodStats } from "@/lib/domain/money.ts";
import { addDaysISO, todayLocal } from "@/lib/data/dates";
import NewTransactionForm from "./NewTransactionForm";
import NewAccountForm from "./NewAccountForm";
import TxnRowActions from "./TxnRowActions";

export default async function MoneyPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t0 = todayLocal();
  const from15 = addDaysISO(t0, -15);

  const [{ data: profile }, { data: accounts }, { data: entries }, { data: budgets }, { data: categories }, { data: debts }, { data: familyMembers }] =
    await Promise.all([
      supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("journal_entries").select("*, journal_lines(*)").order("entry_date", { ascending: false }),
      supabase.from("budgets").select("*").eq("period", "current"),
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
  const stats = periodStats(entriesForDomain, from15);

  const budgetSpent = new Map<string, number>();
  for (const e of entries ?? []) {
    if (e.status === "Reversed" || e.type !== "expense" || e.entry_date < from15) continue;
    const amt = (e.journal_lines ?? []).reduce((s, l) => s + Math.max(0, -l.amount), 0);
    budgetSpent.set(e.category ?? "", (budgetSpent.get(e.category ?? "") ?? 0) + amt);
  }

  const familyById = new Map((familyMembers ?? []).map((m) => [m.id, m.name]));
  const debtById = new Map((debts ?? []).map((d) => [d.id, d.name]));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid md:grid-cols-2 gap-3.5">
        <Card hero>
          <div className="text-xs" style={{ opacity: 0.85 }}>
            Liquidez total · corte {fdate(new Date().toISOString())}
          </div>
          <div className="text-3xl font-black">{money(liquidity, currency, locale)}</div>
          <div className="text-xs p-2 rounded-lg mt-2" style={{ background: "rgba(255,255,255,.14)", border: "1px solid #fff", color: "#fff" }}>
            Ledger de doble partida · las transferencias no cuentan como ingreso ni gasto (BR-002).
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3.5">
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Ingreso (periodo)</span>
            <b className="block text-xl">{money0(stats.income, currency, locale)}</b>
          </div>
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Gasto (periodo)</span>
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
            <h3 className="font-bold">Resumen de presupuesto</h3>
            <Link href="/money/budget" className="btn-ghost btn-sm">
              Ver pestaña completa
            </Link>
          </div>
          {!budgets?.length && <EmptyState icon="💰" text="Genera tu presupuesto quincenal desde la pestaña de Presupuesto." />}
          {(budgets ?? []).slice(0, 4).map((b) => {
            const spent = budgetSpent.get(b.category) ?? 0;
            const pct = b.amount ? Math.round((spent / b.amount) * 100) : 0;
            return (
              <div key={b.id} className="my-2.5">
                <div className="flex justify-between text-sm">
                  <span>{b.category}</span>
                  <span>
                    {money0(spent, currency, locale)} / {money0(b.amount, currency, locale)}
                  </span>
                </div>
                <Progress pct={pct} kind={pct >= 100 ? "bad" : pct >= 85 ? "warn" : undefined} />
              </div>
            );
          })}
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
    </div>
  );
}
