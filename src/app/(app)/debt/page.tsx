import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
import { money, money0 } from "@/lib/format";
import { netWorth, accountBalance } from "@/lib/domain/money.ts";
import DebtForm from "./DebtForm";
import DebtSimulator from "./DebtSimulator";
import { getSessionUser } from "@/lib/data/session";

export default async function DebtPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: debts }, { data: assets }, { data: investments }, { data: accounts }, { data: entries }, { data: liabilities }] = await Promise.all([
    supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
    supabase.from("debts").select("*").order("created_at"),
    supabase.from("assets").select("value"),
    supabase.from("investments").select("valuation"),
    supabase.from("accounts").select("id, opening_balance"),
    supabase.from("journal_entries").select("*, journal_lines(*)"),
    supabase.from("liabilities").select("value")
  ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  const entriesForDomain = (entries ?? []).map((e) => ({
    id: e.id,
    type: e.type as "income" | "expense" | "transfer",
    date: e.entry_date,
    category: e.category,
    status: e.status as "Posted" | "Reconciled" | "Reversed",
    lines: (e.journal_lines ?? []).map((l) => ({ account: l.account_id, amount: l.amount }))
  }));
  const liquidity = (accounts ?? []).reduce((s, a) => s + accountBalance(a.id, a.opening_balance, entriesForDomain), 0);
  const totalAssets = liquidity + (investments ?? []).reduce((s, i) => s + i.valuation, 0) + (assets ?? []).reduce((s, a) => s + a.value, 0);
  const totalLiabilities = (debts ?? []).reduce((s, d) => s + d.balance, 0) + (liabilities ?? []).reduce((s, l) => s + l.value, 0);

  const totalBalance = (debts ?? []).reduce((s, d) => s + d.balance, 0);
  const totalMin = (debts ?? []).reduce((s, d) => s + d.min_payment, 0);
  const maxRate = Math.max(0, ...(debts ?? []).map((d) => d.rate));
  const monthlyInterest = (debts ?? []).reduce((s, d) => s + (d.balance * d.rate) / 100 / 12, 0);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid md:grid-cols-2 gap-3.5">
        <Card hero>
          <div className="text-xs" style={{ opacity: 0.85 }}>Deuda total</div>
          <div className="text-3xl font-black">{money(totalBalance, profile.currency, profile.locale)}</div>
          <div className="flex justify-between mt-1.5 text-sm">
            <span>Patrimonio neto</span>
            <b>{money0(netWorth(totalAssets, totalLiabilities), profile.currency, profile.locale)}</b>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3.5">
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Deudas</span>
            <b className="block text-lg">{debts?.length ?? 0}</b>
          </div>
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Pago mínimo/mes</span>
            <b className="block text-lg">{money0(totalMin, profile.currency, profile.locale)}</b>
          </div>
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Mayor tasa</span>
            <b className="block text-lg">{maxRate}%</b>
          </div>
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Interés est./mes</span>
            <b className="block text-lg">{money0(monthlyInterest, profile.currency, profile.locale)}</b>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Deudas</h3>
        <DebtForm />
      </div>
      <Card>
        {!debts?.length && <EmptyState icon="💳" text="Sin deudas registradas." />}
        {(debts ?? []).map((d) => (
          <div key={d.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="grow">
              <b>{d.name}</b>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {d.rate}% anual · mín {money0(d.min_payment, profile.currency, profile.locale)} · vence día {d.due_day}
              </div>
            </div>
            <b>{money(d.balance, profile.currency, profile.locale)}</b>
            <DebtForm debt={{ id: d.id, name: d.name, balance: d.balance, rate: d.rate, minPayment: d.min_payment, dueDay: d.due_day }} />
          </div>
        ))}
      </Card>

      {debts && debts.length > 0 && (
        <DebtSimulator
          debts={debts.map((d) => ({ id: d.id, name: d.name, balance: d.balance, rate: d.rate, minPayment: d.min_payment }))}
          currency={profile.currency}
          locale={profile.locale}
        />
      )}
    </div>
  );
}
