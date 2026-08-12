import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState } from "@/components/ui";
import { money0, fdate } from "@/lib/format";
import { savingsProjection } from "@/lib/domain/money.ts";
import { SavingsGoalForm, ContributeButton } from "./SavingsGoalForm";

export default async function SavingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: goals }] = await Promise.all([
    supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
    supabase.from("savings_goals").select("*").order("created_at")
  ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Metas de ahorro</h3>
        <SavingsGoalForm />
      </div>

      {!goals?.length ? (
        <Card>
          <EmptyState icon="🏦" text="Crea tu primer fondo o meta." />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3.5">
          {goals.map((g) => {
            const proj = savingsProjection(g.target, g.current_amount, g.monthly);
            const eta = proj.months === Infinity ? null : new Date(Date.now() + proj.months * 30 * 86400000);
            return (
              <Card key={g.id}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{g.name}</h3>
                  <Chip kind={g.priority === "High" ? "accent" : undefined}>{g.type}</Chip>
                </div>
                <div className="flex items-center gap-4 my-3">
                  <div
                    className="rounded-full grid place-items-center"
                    style={{ width: 90, height: 90, background: `conic-gradient(var(--accent) ${proj.pct}%, var(--surface2) 0)` }}
                  >
                    <div className="rounded-full grid place-items-center text-center font-bold" style={{ width: 64, height: 64, background: "var(--surface)" }}>
                      {proj.pct}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>Progreso</div>
                    <b className="block text-lg">{money0(g.current_amount, profile.currency, profile.locale)}</b>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>de {money0(g.target, profile.currency, profile.locale)}</div>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Aportación mensual</span>
                  <b>{money0(g.monthly, profile.currency, profile.locale)}</b>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Faltan</span>
                  <b>{proj.months === Infinity ? "—" : `${proj.months} meses`}</b>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Fecha estimada</span>
                  <b>{eta ? fdate(eta.toISOString()) : "Define aportación"}</b>
                </div>
                <div className="flex gap-2 mt-2.5 flex-wrap">
                  <ContributeButton goalId={g.id} />
                  <SavingsGoalForm
                    goal={{
                      id: g.id,
                      name: g.name,
                      type: g.type,
                      target: g.target,
                      current: g.current_amount,
                      monthly: g.monthly,
                      targetDate: g.target_date,
                      priority: g.priority
                    }}
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
