// src/lib/identity/brief-view.ts
// La forma en que el brief viaja a la pantalla. Sin "server-only": la
// importan los componentes cliente como tipo.
import type { Database } from "@/types/database.types";
import type { Brief } from "@/lib/domain/identity/brief.ts";

export type Reaccion = "resuena" | "no_resuena";

export interface BriefView extends Brief {
  id: string;
  date: string;
  generation: number;
  reactions: Record<string, Reaccion>;
}

type Row = Database["public"]["Tables"]["identity_briefs"]["Row"];

/** De la fila (snake_case, jsonb) a lo que pinta la pantalla. */
export function briefDeFila(r: Row): BriefView {
  const afirmaciones = (r.affirmations as { id: string; text: string; trait_id: string | null }[]) ?? [];
  const vis = r.visualization as { title: string; duration_min: number; steps: { text: string; seconds: number }[] };
  const quote = r.quote as Brief["quote"];
  return {
    id: r.id,
    date: r.local_date,
    generation: r.generation,
    reactions: (r.reactions as Record<string, Reaccion>) ?? {},
    affirmations: afirmaciones.map((a) => ({ id: a.id, text: a.text, traitId: a.trait_id })),
    visualization: { title: vis.title, durationMin: vis.duration_min, steps: vis.steps ?? [] },
    identityReminder: r.identity_reminder,
    reflectionQuestion: r.reflection_question,
    quote,
    factIds: r.fact_ids
  };
}

/** Del brief saneado a las columnas de `identity_briefs`. */
export function filaDeBrief(b: Brief) {
  return {
    affirmations: b.affirmations.map((a) => ({ id: a.id, text: a.text, trait_id: a.traitId })),
    visualization: { title: b.visualization.title, duration_min: b.visualization.durationMin, steps: b.visualization.steps },
    identity_reminder: b.identityReminder,
    reflection_question: b.reflectionQuestion,
    quote: b.quote,
    fact_ids: b.factIds
  };
}
