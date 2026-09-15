// src/lib/domain/insights/facts/identity.ts
// Hechos de identidad para el brief diario — lógica pura (probada en
// tests/domain/insights-identity.test.ts).
//
// Los extractores de siempre buscan lo que va MAL (rachas rotas, metas en
// riesgo). El brief de identidad necesita también lo que va BIEN, porque su
// trabajo es reforzar a la persona en la que alguien se está convirtiendo:
// rachas que merecen nombrarse, récords, rasgos por los que vota mucho o poco,
// el Identity Score moviéndose y metas cumplidas. Todo con cifras ya
// calculadas: el modelo solo las cita.

import { addDaysISO } from "../../datetime.ts";
import { completionRate, habitStreaks, type HabitSeries } from "../../development/habit-analytics.ts";
import { clampWeight, type Fact } from "../types.ts";

export interface IdentitySnapshot {
  today: string;
  habits: { id: string; name: string }[];
  series: HabitSeries[];
  traits: { id: string; name: string; active: boolean }[];
  votes: { habitId: string; traitId: string }[];
  score: number | null;
  scoreWeekAgo: number | null;
  goalsAchieved: { id: string; title: string; achievedOn: string }[];
  solidStreak: number;
}

/** Desde aquí una racha merece nombrarse: una semana, o tres semanas si es semanal. */
const RACHA_DIAS = 7;
const RACHA_SEMANAS = 3;

function unidad(n: number, u: "día" | "semana"): string {
  if (u === "semana") return n === 1 ? "1 semana" : `${n} semanas`;
  return n === 1 ? "1 día" : `${n} días`;
}

export function identityFacts(s: IdentitySnapshot): Fact[] {
  const facts: Fact[] = [];
  const nombre = new Map(s.habits.map((h) => [h.id, h.name]));
  const desde = addDaysISO(s.today, -364);

  for (const serie of s.series) {
    const h = nombre.get(serie.habitId);
    if (!h) continue;
    const r = habitStreaks(serie, s.today, desde);
    const minimo = r.unit === "semana" ? RACHA_SEMANAS : RACHA_DIAS;
    if (r.current < minimo) continue;

    const esRecord = r.current === r.longest;
    facts.push({
      id: `identity.streak.${serie.habitId}`,
      domain: "habits",
      label: esRecord
        ? `"${h}" está en su mejor racha: ${unidad(r.current, r.unit)} seguidos`
        : `"${h}" lleva ${unidad(r.current, r.unit)} seguidos (su mejor marca es ${unidad(r.longest, r.unit)})`,
      weight: clampWeight(r.current / (r.unit === "semana" ? 8 : 30) + (esRecord ? 0.2 : 0)),
      refs: [{ table: "habits", id: serie.habitId }]
    });
  }

  const porHabito = new Map(s.series.map((x) => [x.habitId, x]));
  for (const t of s.traits.filter((x) => x.active)) {
    const suyas = s.votes
      .filter((v) => v.traitId === t.id)
      .map((v) => porHabito.get(v.habitId))
      .filter((x): x is HabitSeries => x !== undefined);
    if (!suyas.length) continue;
    const pct = completionRate(suyas, addDaysISO(s.today, -29), s.today, s.today);
    if (pct === null) continue;
    if (pct >= 80) {
      facts.push({
        id: `identity.trait-strong.${t.id}`,
        domain: "habits",
        label: `Los hábitos que votan por "${t.name}" se cumplieron el ${pct} % en 30 días`,
        weight: clampWeight(pct / 100 - 0.2),
        refs: [{ table: "identity_traits", id: t.id }]
      });
    } else if (pct <= 40) {
      facts.push({
        id: `identity.trait-weak.${t.id}`,
        domain: "habits",
        label: `Los hábitos que votan por "${t.name}" solo se cumplieron el ${pct} % en 30 días`,
        weight: clampWeight(0.9 - pct / 100),
        refs: [{ table: "identity_traits", id: t.id }]
      });
    }
  }

  if (s.score !== null && s.scoreWeekAgo !== null && Math.abs(s.score - s.scoreWeekAgo) >= 5) {
    const d = s.score - s.scoreWeekAgo;
    facts.push({
      id: `identity.score-${d > 0 ? "up" : "down"}`,
      domain: "habits",
      label: `El Identity Score ${d > 0 ? "subió" : "bajó"} de ${s.scoreWeekAgo} a ${s.score} en una semana`,
      weight: clampWeight(Math.abs(d) / 20),
      refs: []
    });
  }

  for (const g of s.goalsAchieved) {
    if (g.achievedOn < addDaysISO(s.today, -13)) continue;
    facts.push({
      id: `identity.goal-achieved.${g.id}`,
      domain: "growth",
      label: `Lograste la meta "${g.title}" el ${g.achievedOn}`,
      weight: 0.8,
      refs: [{ table: "personal_goals", id: g.id }]
    });
  }

  if (s.solidStreak >= 3) {
    facts.push({
      id: "identity.solid-days",
      domain: "habits",
      label: `Llevas ${s.solidStreak} días sólidos seguidos (80 % o más de lo que tocaba)`,
      weight: clampWeight(s.solidStreak / 14),
      refs: []
    });
  }

  return facts;
}
