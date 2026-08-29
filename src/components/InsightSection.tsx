import { createClient } from "@/lib/supabase/server";
import type { Scope } from "@/lib/insights/context";
import InsightPanel, { type RecommendationLite } from "./InsightPanel";

/**
 * El panel de recomendaciones de un ámbito, ya cargado.
 *
 * POR QUÉ EXISTE
 * La consulta y el mapeo de filas vivían dentro de /money. Al llegar el segundo
 * ámbito la elección era copiar veinte líneas en cada página o subirlas aquí, y
 * copiar significaba que el día que cambie una columna de `recommendations`
 * haya cuatro sitios donde arreglarlo y tres donde olvidarlo.
 *
 * Es un Server Component que hace su propia consulta a propósito: así la página
 * que lo embebe no espera por él para pintar lo suyo. En /money la consulta era
 * secuencial y bloqueaba el resto del dashboard.
 *
 * Solo trae las VIVAS (`Presented`). Lo silenciado y lo descartado se ve en la
 * bandeja de /intelligence, que es donde se puede deshacer.
 */
export default async function InsightSection({ scope }: { scope: Scope }) {
  const supabase = await createClient();

  // `recommendations.domain` guarda el ámbito con el que se pidió el análisis
  // (ver `domain: scope` al insertar en lib/insights/actions.ts).
  const { data } = await supabase
    .from("recommendations")
    .select("id, type, text, confidence, impact, assumptions, evidence")
    .eq("domain", scope)
    .eq("status", "Presented")
    .order("created_at", { ascending: false });

  const recommendations = (data ?? []).map(
    (r): RecommendationLite => ({
      id: r.id,
      type: r.type,
      text: r.text,
      confidence: r.confidence,
      impact: r.impact,
      assumptions: Array.isArray(r.assumptions) ? (r.assumptions as string[]) : [],
      evidence: Array.isArray(r.evidence) ? (r.evidence as string[]) : []
    })
  );

  return <InsightPanel scope={scope} recommendations={recommendations} />;
}
