import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Stat } from "@/components/ui";
import { money0, fdate } from "@/lib/format";
import FamilyMemberForm from "./FamilyMemberForm";

export default async function HouseholdPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: members }, { data: entries }, { data: goals }, { data: investments }] = await Promise.all([
    supabase.from("profiles").select("currency, locale").eq("user_id", user.id).single(),
    supabase.from("family_members").select("*").order("created_at"),
    supabase.from("journal_entries").select("*, journal_lines(*)").not("family_member_id", "is", null),
    supabase.from("financial_goals").select("*").not("family_member_id", "is", null),
    supabase.from("investments").select("*").not("family_member_id", "is", null)
  ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  function memberStats(memberId: string) {
    const memberEntries = (entries ?? []).filter((e) => e.family_member_id === memberId && e.status !== "Reversed");
    let income = 0;
    let expense = 0;
    for (const e of memberEntries) {
      const amt = (e.journal_lines ?? []).reduce((s, l) => s + l.amount, 0);
      if (e.type === "income") income += Math.max(0, amt);
      else if (e.type === "expense") expense += Math.max(0, -amt);
    }
    return { income, expense, count: memberEntries.length };
  }

  const totals = (members ?? []).reduce(
    (acc, m) => {
      const s = memberStats(m.id);
      return { income: acc.income + s.income, expense: acc.expense + s.expense };
    },
    { income: 0, expense: 0 }
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--purple) 9%, var(--surface))", borderLeft: "3px solid var(--purple)" }}>
        Módulo privado del titular: registra a tu cónyuge e hijos, atribuye transacciones por miembro, y consulta el gasto,
        metas e inversiones de tus dependientes económicos. Esto es distinto de un Workspace de colaboración: nunca se
        comparte con nadie más (BR-020, FR-MNY-017).
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Miembros de hogar</h3>
        <FamilyMemberForm />
      </div>

      {!members?.length ? (
        <Card>
          <EmptyState icon="👪" text="Crea a tu cónyuge, hijos u otros miembros para llevar sus finanzas." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
            <Stat label="Miembros" value={members.length} />
            <Stat label="Ingreso atribuido" value={money0(totals.income, profile.currency, profile.locale)} />
            <Stat label="Gasto atribuido" value={money0(totals.expense, profile.currency, profile.locale)} />
          </div>

          <div className="grid md:grid-cols-3 gap-3.5">
            {members.map((m) => {
              const s = memberStats(m.id);
              const memberGoals = (goals ?? []).filter((g) => g.family_member_id === m.id);
              const memberInvestments = (investments ?? []).filter((i) => i.family_member_id === m.id);
              return (
                <Card key={m.id}>
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl grid place-items-center font-black text-white flex-shrink-0" style={{ width: 44, height: 44, background: "var(--accent)" }}>
                      {m.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="grow">
                      <b>{m.name}</b>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {m.relationship} · {m.member_type}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <Stat label="Ingreso" value={money0(s.income, profile.currency, profile.locale)} />
                    <Stat label="Gasto" value={money0(s.expense, profile.currency, profile.locale)} />
                  </div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <Chip>{memberGoals.length} meta(s)</Chip>
                    <Chip>{memberInvestments.length} inversión(es)</Chip>
                    <Chip>{s.count} mov.</Chip>
                  </div>
                  <div className="mt-2">
                    <FamilyMemberForm member={{ id: m.id, name: m.name, relationship: m.relationship, memberType: m.member_type }} />
                  </div>
                  {(memberGoals.length > 0 || memberInvestments.length > 0) && (
                    <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                      {memberGoals.map((g) => (
                        <div key={g.id} className="text-xs flex justify-between py-1">
                          <span>{g.name}</span>
                          <span style={{ color: "var(--muted)" }}>Meta: {money0(g.target, profile.currency, profile.locale)}</span>
                        </div>
                      ))}
                      {memberInvestments.map((i) => (
                        <div key={i.id} className="text-xs flex justify-between py-1">
                          <span>{i.name}</span>
                          <span style={{ color: "var(--muted)" }}>{money0(i.valuation, profile.currency, profile.locale)} · {fdate(i.as_of)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      <div className="text-xs p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--info) 9%, var(--surface))", borderLeft: "3px solid var(--info)" }}>
        Filtra reportes de Dinero por miembro desde cada movimiento (FR-MNY-015). Abre un miembro para ver cómo gasta, ahorra
        e invierte (FR-MNY-016). Las metas e inversiones de dependientes se administran desde sus propios módulos, asociándolas
        a un miembro (FR-GOL-004, FR-INV-007).
      </div>
    </div>
  );
}
