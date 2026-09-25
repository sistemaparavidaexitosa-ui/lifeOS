// src/lib/money/inversiones.ts
// Las posiciones con sus movimientos, bajo la RLS de quien pregunta (D-200).
// SERVIDOR. Lo usan /investments, su detalle y el Centro: una sola lectura
// para que la curva salga igual se mire desde donde se mire.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { MovimientoPuro, PosicionConMovimientos, TipoDeMovimiento } from "@/lib/domain/money/curva-inversion.ts";

type Db = SupabaseClient<Database>;

const COLUMNAS_MOV = "id, kind, amount, occurred_on, note, created_at";

function aPuro(m: { id: string; kind: string; amount: number; occurred_on: string; note: string; created_at: string }): MovimientoPuro {
  return { id: m.id, kind: m.kind as TipoDeMovimiento, amount: Number(m.amount), occurred_on: m.occurred_on, note: m.note, created_at: m.created_at };
}

export async function leerPosiciones(supabase: Db): Promise<PosicionConMovimientos[]> {
  const { data, error } = await supabase
    .from("investments")
    .select(`id, name, currency, investment_movements(${COLUMNAS_MOV})`)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    currency: i.currency,
    movimientos: (i.investment_movements ?? []).map(aPuro)
  }));
}

export async function leerPosicion(supabase: Db, id: string) {
  const { data, error } = await supabase
    .from("investments")
    .select(`id, name, currency, kind, institution, broker, rate, source, family_member_id, investment_movements(${COLUMNAS_MOV})`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { investment_movements, ...resto } = data;
  return { ...resto, rate: Number(resto.rate), movimientos: (investment_movements ?? []).map(aPuro) };
}
