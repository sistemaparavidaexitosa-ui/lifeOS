import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { getUserTimeZone } from "@/lib/data/profile";
import { todayInTimeZone } from "@/lib/domain/datetime.ts";
import { Card, EmptyState, Stat } from "@/components/ui";
import { money, fdate } from "@/lib/format";
import { curvaDePosicion, rendimientoPct } from "@/lib/domain/money/curva-inversion.ts";
import { leerPosicion } from "@/lib/money/inversiones";
import InvestmentCurve from "@/components/charts/InvestmentCurve";
import MovimientoForm from "./MovimientoForm";
import MovimientosLista from "./MovimientosLista";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una posición: su curva, sus movimientos y dónde registrar el siguiente (D-200). */
export default async function PosicionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const [posicion, { data: profile }] = await Promise.all([
    leerPosicion(supabase, id),
    supabase.from("profiles").select("locale").eq("user_id", user.id).single()
  ]);
  if (!posicion) notFound();
  const locale = profile?.locale ?? "es-MX";
  const hoy = todayInTimeZone(await getUserTimeZone());

  const curva = curvaDePosicion(posicion.movimientos, hoy);
  const ultimo = curva[curva.length - 1] ?? { fecha: hoy, valor: 0, capital: 0 };
  const rend = rendimientoPct(ultimo);
  const recientes = [...posicion.movimientos].sort((a, b) =>
    a.occurred_on === b.occurred_on ? b.created_at.localeCompare(a.created_at) : b.occurred_on.localeCompare(a.occurred_on)
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm">
        <Link href="/investments" style={{ color: "var(--muted)" }}>← Inversiones</Link>
      </div>
      <Card hero>
        <div className="text-xs" style={{ opacity: 0.85 }}>{posicion.name} · {posicion.institution || posicion.broker || "—"}</div>
        <div className="text-3xl font-black">{money(ultimo.valor, posicion.currency, locale)}</div>
        <div className="flex justify-between mt-1.5 text-sm">
          <span>Rendimiento simple</span>
          <b>{rend === null ? "—" : `${rend >= 0 ? "+" : ""}${rend}%`}</b>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3.5">
        <Stat label="Capital aportado" value={money(ultimo.capital, posicion.currency, locale)} />
        <Stat label="Último movimiento" value={recientes[0] ? fdate(recientes[0].occurred_on) : "—"} />
      </div>
      <Card>
        <h3 className="font-bold mb-2">Evolución</h3>
        {curva.length >= 2 ? (
          <InvestmentCurve data={curva} currency={posicion.currency} locale={locale} />
        ) : (
          <EmptyState icon="📈" text="Registra una valuación o un movimiento más para ver la curva." />
        )}
      </Card>
      <Card>
        <h3 className="font-bold mb-2">Registrar movimiento</h3>
        <MovimientoForm investmentId={posicion.id} today={hoy} />
      </Card>
      <Card>
        <h3 className="font-bold mb-2">Movimientos</h3>
        {recientes.length ? (
          <MovimientosLista
            investmentId={posicion.id}
            currency={posicion.currency}
            locale={locale}
            movimientos={recientes.map((m) => ({ id: m.id!, kind: m.kind, amount: m.amount, occurred_on: m.occurred_on, note: m.note ?? "" }))}
          />
        ) : (
          <EmptyState icon="🧾" text="Sin movimientos." />
        )}
      </Card>
    </div>
  );
}
