// Lee la señal de aprendizaje con la sesión (D-204). SERVIDOR.
import "server-only";
import type { Db } from "@/lib/insights/facts-loader";
import { addDaysISO } from "@/lib/domain/datetime.ts";
import { resumirResultados, DIAS_RESULTADOS, type EntradaResultados } from "@/lib/domain/centro/agente/resultados.ts";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function cargarResultados(supabase: Db, userId: string, hoy: string): Promise<string[]> {
  const desde = addDaysISO(hoy, -DIAS_RESULTADOS);
  const [{ data: propuestas }, { data: eventos }] = await Promise.all([
    supabase
      .from("coach_proposals")
      .select("tipo, status, payload")
      .eq("user_id", userId)
      .eq("origen", "centro")
      .in("status", ["accepted", "dismissed"])
      .gte("created_at", `${desde}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("audit_log")
      .select("action, meta")
      .eq("user_id", userId)
      .in("action", ["ai.centro_escritura", "ai.centro_entendimiento"])
      .gte("created_at", `${desde}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(200)
  ]);

  const entrada: EntradaResultados = {
    propuestas: (propuestas ?? []).map((p) => {
      const pl = obj(p.payload);
      return { tipo: p.tipo, status: p.status as "accepted" | "dismissed", tabla: str(pl.tabla), operacion: str(pl.operacion) };
    }),
    correcciones: (eventos ?? [])
      .filter((e) => e.action === "ai.centro_escritura")
      .map((e) => {
        const m = obj(e.meta);
        const campos = Array.isArray(m.corregidos) ? m.corregidos.filter((c): c is string => typeof c === "string") : [];
        return { tabla: str(m.tabla) ?? "", campos };
      })
      .filter((c) => c.tabla && c.campos.length),
    entendimiento: (eventos ?? [])
      .filter((e) => e.action === "ai.centro_entendimiento")
      .map((e) => {
        const m = obj(e.meta);
        return { resultado: str(m.resultado) ?? "", tabla: str(m.tabla), operacion: str(m.operacion) };
      })
      .filter((x) => x.resultado)
  };
  return resumirResultados(entrada);
}
