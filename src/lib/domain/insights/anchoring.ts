// src/lib/domain/insights/anchoring.ts
// La garantía estructural de que el modelo no inventa cifras (§3.3).
//
// Cada recomendación debe citar hechos que existían en el contexto que se le
// envió. Una que cite un `factId` inexistente se descarta: no es que el dato
// esté mal redactado, es que no tiene respaldo en la base. Pura y probada,
// porque es la última línea de defensa.

export interface DraftRecommendation {
  type: string;
  text: string;
  confidence: "Alta" | "Media" | "Baja";
  impact: "Alto" | "Medio" | "Bajo";
  factIds: string[];
  assumptions: string[];
}

export interface AnchoringResult {
  kept: DraftRecommendation[];
  /** Las descartadas, con el motivo. Se registran; no se muestran al usuario. */
  dropped: { text: string; reason: string }[];
}

export function validateAnchoring(drafts: DraftRecommendation[], knownFactIds: string[]): AnchoringResult {
  const known = new Set(knownFactIds);
  const kept: DraftRecommendation[] = [];
  const dropped: { text: string; reason: string }[] = [];

  for (const draft of drafts) {
    if (!draft.text.trim()) {
      dropped.push({ text: draft.text, reason: "recomendación vacía" });
      continue;
    }
    if (!draft.factIds.length) {
      dropped.push({ text: draft.text, reason: "no cita ningún hecho" });
      continue;
    }
    const inventados = draft.factIds.filter((id) => !known.has(id));
    if (inventados.length) {
      dropped.push({ text: draft.text, reason: `cita hechos inexistentes: ${inventados.join(", ")}` });
      continue;
    }
    kept.push(draft);
  }
  return { kept, dropped };
}
