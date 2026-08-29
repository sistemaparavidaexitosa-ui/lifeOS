import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState } from "@/components/ui";
import { fdate } from "@/lib/format";
import { ALL_STATUSES, LIVE_STATUSES, STATUS_LABEL, type RecommendationStatus } from "@/lib/domain/insights/states.ts";
import RecommendationRow from "./RecommendationRow";
import { getSessionUser } from "@/lib/data/session";

/**
 * Bandeja histórica del motor (§3.4). A diferencia del panel embebido en
 * /money, aquí se ve TODO: lo vivo, lo aceptado y lo rechazado, porque el
 * historial de rechazos es lo que hace que el motor deje de repetirse y el
 * usuario tiene derecho a ver —y deshacer— lo que silenció.
 */
export default async function IntelligencePage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: all } = await supabase
    .from("recommendations")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = all ?? [];
  const filtro = ALL_STATUSES.includes(estado as RecommendationStatus) ? (estado as RecommendationStatus) : null;
  const visibles = filtro ? rows.filter((r) => r.status === filtro) : rows;
  const vivas = rows.filter((r) => LIVE_STATUSES.includes(r.status as RecommendationStatus)).length;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--c-teal) 9%, var(--surface))", borderLeft: "3px solid var(--c-teal)" }}>
        Las recomendaciones se calculan con tus cifras y las redacta un modelo, que nunca ve una fila cruda de tu base.
        Lo que silencias o reportas vuelve como contexto del siguiente análisis para que el motor no se repita.
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold">
          Recomendaciones{" "}
          <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>
            {vivas} sin resolver de {rows.length}
          </span>
        </h3>
        <Link className="btn-ghost btn-sm" href="/intelligence/memory">
          Memoria
        </Link>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <Link className={`btn-ghost btn-sm${filtro ? "" : " btn-primary"}`} href="/intelligence">
          Todas ({rows.length})
        </Link>
        {ALL_STATUSES.map((s) => {
          const n = rows.filter((r) => r.status === s).length;
          if (!n) return null;
          return (
            <Link key={s} className={`btn-ghost btn-sm${filtro === s ? " btn-primary" : ""}`} href={`/intelligence?estado=${s}`}>
              {STATUS_LABEL[s]} ({n})
            </Link>
          );
        })}
      </div>

      {!visibles.length && (
        <Card>
          <EmptyState
            icon="✨"
            text={rows.length ? "Nada en este estado." : "Todavía no has pedido ningún análisis. El botón está al final de Dinero."}
          />
        </Card>
      )}

      {visibles.map((r) => (
        <Card key={r.id}>
          <div className="flex items-center gap-2 flex-wrap">
            <Chip kind={r.impact === "Alto" ? "bad" : r.impact === "Medio" ? "warn" : ""}>{r.impact}</Chip>
            <Chip kind="info">confianza {r.confidence.toLowerCase()}</Chip>
            <Chip>{STATUS_LABEL[r.status as RecommendationStatus]}</Chip>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {r.domain} · {r.type} · {fdate(r.created_at)}
            </span>
          </div>
          <RecommendationRow
            id={r.id}
            text={r.text}
            status={r.status as RecommendationStatus}
            assumptions={Array.isArray(r.assumptions) ? (r.assumptions as string[]) : []}
            evidence={Array.isArray(r.evidence) ? (r.evidence as string[]) : []}
          />
        </Card>
      ))}
    </div>
  );
}
