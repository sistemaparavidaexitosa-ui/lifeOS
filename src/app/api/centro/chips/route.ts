import { NextResponse } from "next/server";
import { flagsDelRuntime } from "@/config/env";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { getUserTimeZone } from "@/lib/data/profile";
import { hourInTimeZone, addDaysISO } from "@/lib/domain/datetime.ts";
import { todayLocal } from "@/lib/data/dates";
import { franjaDeHoy } from "@/lib/domain/centro/franja.ts";
import { allowedDomains } from "@/lib/insights/context";
import { elegirChips } from "@/lib/domain/centro/agente/chips.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";

/**
 * Los chips de capacidades del Centro (D-204). Sin modelo: catálogo filtrado
 * por los dominios de la persona y la franja, ordenado por lo que más pulsa.
 * Un extra: si algo falla, `chips: []` y el Centro abre igual.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!flagsDelRuntime().runtime) return NextResponse.json({ ok: false, reason: "No encontrado." }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, reason: "Sin sesión." }, { status: 401 });
  try {
    const supabase = await createClient();
    const zona = await getUserTimeZone();
    const hoy = todayLocal(zona);
    const [{ data: perfil }, { data: clics }] = await Promise.all([
      supabase.from("profiles").select("ai_domains").eq("user_id", user.id).single(),
      supabase
        .from("audit_log")
        .select("meta")
        .eq("user_id", user.id)
        .eq("action", "ai.centro_chip")
        .gte("created_at", `${addDaysISO(hoy, -30)}T00:00:00Z`)
        .order("created_at", { ascending: false })
        .limit(500)
    ]);
    const activos = (perfil?.ai_domains ?? []) as Domain[];
    const dominios = allowedDomains("global").filter((d) => activos.includes(d));
    const usos: Record<string, number> = {};
    for (const c of clics ?? []) {
      const id = (c.meta as { id?: unknown } | null)?.id;
      if (typeof id === "string") usos[id] = (usos[id] ?? 0) + 1;
    }
    return NextResponse.json({ ok: true, chips: elegirChips({ dominios, franja: franjaDeHoy(hourInTimeZone(zona)), usos }) });
  } catch (e) {
    console.warn("[centro-agente] chips:", e);
    return NextResponse.json({ ok: true, chips: [] });
  }
}
