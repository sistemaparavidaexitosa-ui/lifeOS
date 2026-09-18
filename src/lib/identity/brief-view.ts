// src/lib/identity/brief-view.ts
// La forma en que el brief viaja a la pantalla. Sin "server-only": la
// importan los componentes cliente como tipo.
//
// TODO LO QUE AÑADIÓ D-164 ES OPCIONAL AQUÍ TAMBIÉN, y no por simetría con la
// base: es lo que permite que la pantalla pinte con un solo camino una fila del
// agente (con mantra, acción y categorías) y una del respaldo (sin nada de
// eso). Si `mantra` fuera `string`, cada componente necesitaría saber quién
// escribió la fila antes de dibujarla.
import type { Database } from "@/types/database.types";
import type { Brief } from "@/lib/domain/identity/brief.ts";
import { areaDe, categoriaDe } from "@/lib/domain/identity/categorias.ts";

export type Reaccion = "resuena" | "no_resuena";

export interface BriefView extends Brief {
  id: string;
  date: string;
  generation: number;
  reactions: Record<string, Reaccion>;
  /** Si la persona marcó hecha la acción del día. */
  actionDone: boolean;
  /** Quién lo escribió: el agente («py») o el respaldo («ts»). */
  generator: "ts" | "py";
}

type Row = Database["public"]["Tables"]["identity_briefs"]["Row"];

/** De la fila (snake_case, jsonb) a lo que pinta la pantalla. */
export function briefDeFila(r: Row): BriefView {
  const afirmaciones = (r.affirmations as { id: string; text: string; trait_id: string | null; category?: string | null }[]) ?? [];
  const vis = r.visualization as { title: string; duration_min: number; steps: { text: string; seconds: number }[] };
  const quote = r.quote as Brief["quote"];
  const accion = r.daily_action as { text: string; trait_id: string | null; area: string | null } | null;

  return {
    id: r.id,
    date: r.local_date,
    generation: r.generation,
    reactions: (r.reactions as Record<string, Reaccion>) ?? {},
    actionDone: r.action_done,
    generator: r.generator === "py" ? "py" : "ts",
    affirmations: afirmaciones.map((a) => ({
      id: a.id,
      text: a.text,
      traitId: a.trait_id,
      // Se vuelve a validar al leer, y no es paranoia: una fila escrita por una
      // versión anterior del agente puede llevar una categoría que ya no
      // existe, y agrupar por una etiqueta desconocida deja un grupo fantasma
      // en la pantalla. `null` la manda a «Otras», que es donde se entiende.
      category: categoriaDe(a.category)
    })),
    visualization: { title: vis.title, durationMin: vis.duration_min, steps: vis.steps ?? [] },
    identityReminder: r.identity_reminder,
    reflectionQuestion: r.reflection_question,
    quote,
    mantra: r.mantra,
    dailyAction: accion ? { text: accion.text, traitId: accion.trait_id, area: areaDe(accion.area) } : null,
    focusArea: areaDe(r.focus_area),
    factIds: r.fact_ids
  };
}

/** Del brief saneado a las columnas de `identity_briefs`. */
export function filaDeBrief(b: Brief) {
  return {
    affirmations: b.affirmations.map((a) => ({ id: a.id, text: a.text, trait_id: a.traitId, category: a.category })),
    visualization: { title: b.visualization.title, duration_min: b.visualization.durationMin, steps: b.visualization.steps },
    identity_reminder: b.identityReminder,
    reflection_question: b.reflectionQuestion,
    quote: b.quote,
    mantra: b.mantra,
    daily_action: b.dailyAction ? { text: b.dailyAction.text, trait_id: b.dailyAction.traitId, area: b.dailyAction.area } : null,
    focus_area: b.focusArea,
    fact_ids: b.factIds
  };
}
