import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserTimeZone } from "@/lib/data/profile";
import { todayInTimeZone } from "@/lib/domain/datetime.ts";
import { Card, Chip, EmptyState } from "@/components/ui";
import { money, money0, fdate } from "@/lib/format";
import { investmentReturnPct } from "@/lib/domain/money.ts";
import InvestmentForm from "./InvestmentForm";
import { getSessionUser } from "@/lib/data/session";

export default async function InvestmentsPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: investments }, { data: familyMembers }] = await Promise.all([
    supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
    supabase.from("investments").select("*").order("created_at"),
    supabase.from("family_members").select("id, name, relationship")
  ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  const total = (investments ?? []).reduce((s, i) => s + i.valuation, 0);
  const principal = (investments ?? []).reduce((s, i) => s + i.principal, 0);
  const overallReturn = investmentReturnPct(principal, total);
  const fija = (investments ?? []).filter((i) => i.kind === "fija").reduce((s, i) => s + i.valuation, 0);
  const variable = (investments ?? []).filter((i) => i.kind === "variable").reduce((s, i) => s + i.valuation, 0);
  const fijaPct = total ? Math.round((fija / total) * 100) : 0;
  const familyById = new Map((familyMembers ?? []).map((m) => [m.id, m.name]));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid md:grid-cols-2 gap-3.5">
        <Card hero>
          <div className="text-xs" style={{ opacity: 0.85 }}>Capital invertido · corte {fdate(todayInTimeZone(await getUserTimeZone()))}</div>
          <div className="text-3xl font-black">{money(total, profile.currency, profile.locale)}</div>
          <div className="flex justify-between mt-1.5 text-sm">
            <span>Rendimiento acumulado</span>
            <b>{overallReturn >= 0 ? "+" : ""}{overallReturn}%</b>
          </div>
          <div className="text-xs p-2 rounded-lg mt-2" style={{ background: "rgba(255,255,255,.14)", border: "1px solid #fff", color: "#fff" }}>
            Toda rentabilidad indica metodología, moneda, periodo y valoración de origen (FR-INV-002).
          </div>
        </Card>
        <Card>
          <h3 className="font-bold mb-2">Distribución por tipo</h3>
          <div className="flex items-center gap-4">
            <div className="rounded-full grid place-items-center" style={{ width: 100, height: 100, background: `conic-gradient(var(--accent) ${fijaPct}%, var(--surface2) 0)` }}>
              <div className="rounded-full grid place-items-center font-bold" style={{ width: 72, height: 72, background: "var(--surface)" }}>
                {fijaPct}%
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm gap-3"><span>Renta fija</span><b>{money0(fija, profile.currency, profile.locale)}</b></div>
              <div className="flex justify-between text-sm gap-3"><span>Renta variable</span><b>{money0(variable, profile.currency, profile.locale)}</b></div>
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Riesgo y liquidez varían por instrumento.</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Posiciones</h3>
        <InvestmentForm familyMembers={familyMembers ?? []} />
      </div>

      <Card className="overflow-auto">
        {!investments?.length ? (
          <EmptyState icon="📈" text="Registra posiciones de renta fija o variable." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }} className="text-left">
                <th className="pb-2">Instrumento</th>
                <th>Tipo</th>
                <th>Institución/Broker</th>
                <th>Capital</th>
                <th>Valor</th>
                <th>Rend.</th>
                <th>Miembro</th>
                <th>Fuente</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {investments.map((i) => {
                const ret = investmentReturnPct(i.principal, i.valuation);
                return (
                  <tr key={i.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="py-2"><b>{i.name}</b></td>
                    <td><Chip kind={i.kind === "fija" ? "info" : "accent"}>{i.kind === "fija" ? "Renta fija" : "Renta variable"}</Chip></td>
                    <td style={{ color: "var(--muted)" }}>{i.institution || i.broker || "—"}</td>
                    <td>{money0(i.principal, profile.currency, profile.locale)}</td>
                    <td>{money0(i.valuation, profile.currency, profile.locale)}</td>
                    <td style={{ color: ret >= 0 ? "var(--ok)" : "var(--danger)" }}>{ret >= 0 ? "+" : ""}{ret}%</td>
                    <td>{i.family_member_id ? <Chip kind="purple">{familyById.get(i.family_member_id)}</Chip> : <span className="text-xs" style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td className="text-xs" style={{ color: "var(--muted)" }}>{i.source} · {fdate(i.as_of)}</td>
                    <td>
                      <InvestmentForm
                        investment={{ id: i.id, kind: i.kind, name: i.name, institutionOrBroker: i.institution || i.broker, principal: i.principal, rate: i.rate, valuation: i.valuation, asOf: i.as_of, source: i.source, familyMemberId: i.family_member_id }}
                        familyMembers={familyMembers ?? []}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div className="text-xs p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--info) 9%, var(--surface))", borderLeft: "3px solid var(--info)" }}>
        Dashboard de inversiones: capital, rendimientos, distribución, riesgo y liquidez (FR-INV-003). Puede asociarse a un
        miembro del hogar (FR-INV-007). El trading y posiciones cortas quedan fuera del MVP (NG-002).
      </div>
    </div>
  );
}
