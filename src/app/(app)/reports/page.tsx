import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Stat } from "@/components/ui";
import { money0, fdate } from "@/lib/format";
import { periodStats, accountBalance, netWorth } from "@/lib/domain/money.ts";
import { addDaysISO, todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";

const PERIODS = [
  { key: "daily", label: "Diario", days: 1 },
  { key: "weekly", label: "Semanal", days: 7 },
  { key: "monthly", label: "Mensual", days: 30 },
  { key: "annual", label: "Anual", days: 365 }
] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period = "weekly" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activePeriod = PERIODS.find((p) => p.key === period) ?? PERIODS[1];
  const t0 = todayLocal(await getUserTimeZone());
  const from = addDaysISO(t0, -activePeriod.days);

  const [{ data: profile }, { data: tasks }, { data: projects }, { data: accounts }, { data: entries }, { data: investments }, { data: assets }, { data: debts }] = await Promise.all([
    supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
    supabase.from("tasks").select("id, status"),
    supabase.from("projects").select("id, status").eq("status", "Active"),
    supabase.from("accounts").select("id, opening_balance"),
    supabase.from("journal_entries").select("*, journal_lines(*)"),
    supabase.from("investments").select("valuation"),
    supabase.from("assets").select("value"),
    supabase.from("debts").select("balance")
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

  const stats = periodStats(entriesForDomain, from);
  const liquidity = (accounts ?? []).reduce((s, a) => s + accountBalance(a.id, a.opening_balance, entriesForDomain), 0);
  const investmentsValue = (investments ?? []).reduce((s, i) => s + i.valuation, 0);
  const totalAssets = liquidity + investmentsValue + (assets ?? []).reduce((s, a) => s + a.value, 0);
  const totalLiabilities = (debts ?? []).reduce((s, d) => s + d.balance, 0);
  const missing = (entries ?? []).some((e) => !e.reconciled) ? ["transacciones sin conciliar"] : [];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-1.5 rounded-2xl p-1.5 flex-wrap" style={{ background: "var(--surface2)" }}>
        {PERIODS.map((p) => (
          <a
            key={p.key}
            href={`/reports?period=${p.key}`}
            className="btn-sm rounded-xl inline-flex items-center"
            style={{ background: activePeriod.key === p.key ? "var(--surface)" : "transparent", minHeight: 34, padding: "5px 11px" }}
          >
            {p.label}
          </a>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">Resumen {activePeriod.label.toLowerCase()}</h3>
          <span className="chip">v1.0</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Tareas completadas" value={(tasks ?? []).filter((t) => t.status === "Completed").length} />
          <Stat label="Proyectos activos" value={projects?.length ?? 0} />
          <Stat label="Ingreso" value={money0(stats.income, profile.currency, profile.locale)} />
          <Stat label="Gasto" value={money0(stats.expense, profile.currency, profile.locale)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <Stat label="Disponible" value={money0(stats.available, profile.currency, profile.locale)} />
          <Stat label="Liquidez" value={money0(liquidity, profile.currency, profile.locale)} />
          <Stat label="Inversiones" value={money0(investmentsValue, profile.currency, profile.locale)} />
          <Stat label="Patrimonio" value={money0(netWorth(totalAssets, totalLiabilities), profile.currency, profile.locale)} />
        </div>
        <div
          className="text-xs p-2.5 rounded-r-xl mt-3"
          style={{
            background: missing.length ? "color-mix(in srgb, var(--warn) 10%, var(--surface))" : "color-mix(in srgb, var(--info) 9%, var(--surface))",
            borderLeft: `3px solid ${missing.length ? "var(--warn)" : "var(--info)"}`
          }}
        >
          {missing.length ? `Datos faltantes: ${missing.join(", ")}` : "Sin datos faltantes. Fuentes: tasks, journal, budgets, investments, netWorthSnaps"}
          {" · corte "}
          {fdate(t0)}
        </div>
      </Card>
    </div>
  );
}
