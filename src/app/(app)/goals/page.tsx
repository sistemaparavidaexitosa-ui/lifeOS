import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState } from "@/components/ui";
import { money0, fdate } from "@/lib/format";
import { accountBalance } from "@/lib/domain/money.ts";
import GoalForm from "./GoalForm";
import { getSessionUser } from "@/lib/data/session";

export default async function GoalsPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: goals }, { data: accounts }, { data: entries }, { data: familyMembers }] = await Promise.all([
    supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
    supabase.from("financial_goals").select("*").order("created_at"),
    supabase.from("accounts").select("id, name, opening_balance"),
    supabase.from("journal_entries").select("*, journal_lines(*)"),
    supabase.from("family_members").select("id, name, relationship")
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
  const familyById = new Map((familyMembers ?? []).map((m) => [m.id, m.name]));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Metas financieras</h3>
        <GoalForm accounts={accounts ?? []} familyMembers={familyMembers ?? []} />
      </div>

      {!goals?.length ? (
        <Card>
          <EmptyState icon="🎯" text="Crea metas como patrimonio objetivo, casa, jubilación o capital para empresa." />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3.5">
          {goals.map((g) => {
            const accountsBalance = (g.account_ids ?? []).reduce((s: number, id: string) => {
              const acc = (accounts ?? []).find((a) => a.id === id);
              return acc ? s + accountBalance(acc.id, acc.opening_balance, entriesForDomain) : s;
            }, 0);
            const current = Math.max(g.current_amount, accountsBalance);
            const pct = g.target ? Math.round((current / g.target) * 100) : 0;
            const monthsLeft = g.horizon ? Math.max(0, Math.round((new Date(g.horizon).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))) : null;
            const monthlyNeeded = monthsLeft ? Math.max(0, Math.round(((g.target - current) / monthsLeft) * 100) / 100) : null;
            const prob = pct >= 100 ? "Alta" : pct >= 60 ? "Media" : "Baja";

            return (
              <Card key={g.id}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{g.name}</h3>
                  <div className="flex gap-1.5">
                    {g.family_member_id && <Chip kind="purple">{familyById.get(g.family_member_id)}</Chip>}
                    <Chip kind={g.priority === "High" ? "accent" : undefined}>Prioridad {g.priority}</Chip>
                  </div>
                </div>
                <div className="flex items-center gap-4 my-3">
                  <div className="rounded-full grid place-items-center" style={{ width: 90, height: 90, background: `conic-gradient(var(--accent) ${Math.min(100, pct)}%, var(--surface2) 0)` }}>
                    <div className="rounded-full grid place-items-center font-bold" style={{ width: 64, height: 64, background: "var(--surface)" }}>
                      {pct}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>Progreso hacia meta</div>
                    <b className="block text-lg">{money0(current, profile.currency, profile.locale)}</b>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>de {money0(g.target, profile.currency, profile.locale)}</div>
                  </div>
                </div>
                <div className="flex justify-between text-sm"><span>Horizonte</span><b>{g.horizon ? fdate(g.horizon) : "—"}</b></div>
                <div className="flex justify-between text-sm"><span>Aportación requerida/mes</span><b>{monthlyNeeded != null ? money0(monthlyNeeded, profile.currency, profile.locale) : "—"}</b></div>
                <div className="flex justify-between text-sm">
                  <span>Probabilidad (escenario)</span>
                  <Chip kind={prob === "Alta" ? "ok" : prob === "Media" ? "warn" : "bad"}>{prob}</Chip>
                </div>
                <div className="text-xs p-2 rounded-lg mt-2" style={{ background: "var(--surface2)" }}>
                  Escenario sujeto a supuestos; no es garantía (BR-010/FR-GOL-003).
                </div>
                <div className="mt-2">
                  <GoalForm
                    goal={{ id: g.id, name: g.name, target: g.target, current: g.current_amount, horizon: g.horizon, priority: g.priority, accountIds: g.account_ids ?? [], familyMemberId: g.family_member_id }}
                    accounts={accounts ?? []}
                    familyMembers={familyMembers ?? []}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
