import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
import { money0 } from "@/lib/format";
import { cashbackAccrued } from "@/lib/domain/money.ts";
import CashbackForm from "./CashbackForm";
import RedeemButton from "./RedeemButton";
import { getSessionUser } from "@/lib/data/session";

export default async function CashbackPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: cards }, { data: debts }, { data: categories }, { data: redemptions }] = await Promise.all([
    supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
    supabase.from("cashback_cards").select("*").order("created_at"),
    supabase.from("debts").select("id, name"),
    supabase.from("categories").select("name"),
    supabase.from("cashback_redemptions").select("*")
  ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  const debtById = new Map((debts ?? []).map((d) => [d.id, d.name]));
  const redemptionsByCard = new Map<string, number[]>();
  for (const r of redemptions ?? []) {
    const arr = redemptionsByCard.get(r.card_id) ?? [];
    arr.push(r.amount);
    redemptionsByCard.set(r.card_id, arr);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--warn) 10%, var(--surface))", borderLeft: "3px solid var(--warn)" }}>
        El cashback es informativo/estimado; no proviene de una integración bancaria en tiempo real (NG-012).
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Tarjetas con Cashback</h3>
        <CashbackForm debts={debts ?? []} categories={(categories ?? []).map((c) => c.name)} />
      </div>

      {!cards?.length ? (
        <Card>
          <EmptyState icon="💳" text="Registra una tarjeta con cashback para llevar el estimado acumulado." />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3.5">
          {cards.map((c) => {
            const accrued = cashbackAccrued(c.accrued_estimate, redemptionsByCard.get(c.id) ?? []);
            return (
              <Card key={c.id}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{c.name}</h3>
                  <span className="chip">{c.rate_pct}% cashback</span>
                </div>
                <div className="text-2xl font-black my-2">{money0(accrued, profile.currency, profile.locale)}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Categorías elegibles: {c.eligible_categories?.join(", ") || "—"}
                </div>
                {c.debt_id && (
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    Vinculada a deuda: {debtById.get(c.debt_id)}
                  </div>
                )}
                <div className="flex gap-2 mt-2.5 flex-wrap">
                  <RedeemButton cardId={c.id} />
                  <CashbackForm
                    card={{ id: c.id, name: c.name, ratePct: c.rate_pct, debtId: c.debt_id, accruedEstimate: c.accrued_estimate, eligibleCategories: c.eligible_categories ?? [] }}
                    debts={debts ?? []}
                    categories={(categories ?? []).map((cat) => cat.name)}
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
