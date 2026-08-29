import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserTimeZone } from "@/lib/data/profile";
import { todayInTimeZone } from "@/lib/domain/datetime.ts";
import { Card, EmptyState } from "@/components/ui";
import { money, money0, fdate } from "@/lib/format";
import { accountBalance, netWorth } from "@/lib/domain/money.ts";
import AssetForm from "./AssetForm";
import SnapshotButton from "./SnapshotButton";
import { getSessionUser } from "@/lib/data/session";

export default async function WealthPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: accounts }, { data: entries }, { data: investments }, { data: assets }, { data: debts }, { data: liabilities }, { data: snapshots }] =
    await Promise.all([
      supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
      supabase.from("accounts").select("id, opening_balance"),
      supabase.from("journal_entries").select("*, journal_lines(*)"),
      supabase.from("investments").select("valuation"),
      supabase.from("assets").select("*").order("created_at"),
      supabase.from("debts").select("id, name, balance, rate"),
      supabase.from("liabilities").select("value"),
      supabase.from("net_worth_snapshots").select("*").order("as_of", { ascending: true })
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
  const investmentsValue = (investments ?? []).reduce((s, i) => s + i.valuation, 0);
  const totalAssets = liquidity + investmentsValue + (assets ?? []).reduce((s, a) => s + a.value, 0);
  const totalLiabilities = (debts ?? []).reduce((s, d) => s + d.balance, 0) + (liabilities ?? []).reduce((s, l) => s + l.value, 0);
  const net = netWorth(totalAssets, totalLiabilities);

  return (
    <div className="flex flex-col gap-3.5">
      <Card hero>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs" style={{ opacity: 0.85 }}>Patrimonio neto · {fdate(todayInTimeZone(await getUserTimeZone()))}</div>
            <div className="text-3xl font-black">{money(net, profile.currency, profile.locale)}</div>
          </div>
          <SnapshotButton />
        </div>
        <div className="flex justify-between mt-2 text-sm">
          <span>Activos</span>
          <b>{money0(totalAssets, profile.currency, profile.locale)}</b>
        </div>
        <div className="flex justify-between text-sm">
          <span>Pasivos</span>
          <b>{money0(totalLiabilities, profile.currency, profile.locale)}</b>
        </div>
      </Card>

      {snapshots && snapshots.length > 0 && (
        <Card>
          <h3 className="font-bold mb-2">Curva de patrimonio (snapshots inmutables)</h3>
          <div className="flex justify-between text-xs" style={{ color: "var(--muted)" }}>
            <span>{fdate(snapshots[0]!.as_of)}</span>
            <span>{fdate(snapshots[snapshots.length - 1]!.as_of)}</span>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Activos</h3>
        <AssetForm />
      </div>
      <Card>
        <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--line)" }}>
          <b>Liquidez (cuentas)</b>
          <b>{money0(liquidity, profile.currency, profile.locale)}</b>
        </div>
        <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--line)" }}>
          <b>Inversiones</b>
          <b>{money0(investmentsValue, profile.currency, profile.locale)}</b>
        </div>
        {(assets ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="grow">
              <b>{a.name}</b>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {a.kind} · {fdate(a.as_of)} · {a.source}
              </div>
            </div>
            <b>{money0(a.value, profile.currency, profile.locale)}</b>
            <AssetForm asset={{ id: a.id, name: a.name, kind: a.kind, value: a.value, asOf: a.as_of, source: a.source }} />
          </div>
        ))}
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Pasivos</h3>
        <Link href="/debt" className="btn-ghost btn-sm">
          Gestionar deudas
        </Link>
      </div>
      <Card>
        {!debts?.length && <EmptyState icon="📉" text="Sin pasivos." />}
        {(debts ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--line)" }}>
            <div>
              <b>{d.name}</b>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Deuda · {d.rate}%</div>
            </div>
            <b>{money0(d.balance, profile.currency, profile.locale)}</b>
          </div>
        ))}
      </Card>
    </div>
  );
}
