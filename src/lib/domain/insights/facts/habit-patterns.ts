// src/lib/domain/insights/facts/habit-patterns.ts
// Patrones de hábitos para los insights nocturnos — lógica pura (probada en
// tests/domain/insights-habit-patterns.test.ts).
//
// Es el tramo de hábitos de la fase A3 del sistema cognitivo: tendencias y
// correlaciones sobre 12 semanas de registro, más un par de estados que
// merecen decirse («completas tu rutina de la mañana el 92 %»). Los umbrales
// son deliberadamente altos:
//   - al menos 6 semanas de datos antes de hablar de tendencias o correlaciones;
//   - una brecha de 15 puntos o más, con al menos 8 días a cada lado.
// Con menos, lo que sale es ruido con aspecto de hallazgo, y un motor que
// afirma patrones que no existen pierde la confianza en una semana.
//
// Las etiquetas de `correlacion` hablan de asociación («los días que…»),
// nunca de causa. El modelo las cita tal cual.

import { addDaysISO, diffDays } from "../../datetime.ts";
import { completionRate, slotStates, type HabitSeries } from "../../development/habit-analytics.ts";
import { clampWeight, type Fact } from "../types.ts";

export interface PatternsSnapshot {
  today: string;
  habits: { id: string; name: string; routineId: string }[];
  routines: { id: string; name: string }[];
  series: HabitSeries[];
  checkins: { id?: string; date: string; mood: number | null; energy: number | null; sleepHours: number | null }[];
}

const VENTANA = 84;
const MIN_DIAS_DATOS = 42;
const MIN_DIAS_LADO = 8;
const BRECHA = 15;

const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function media(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * Valor de cada hábito diario por día, en [desde, ayer]: el pct si se juzgó,
 * sin entrada si fue pospuesto o no tocaba. Los semanales quedan fuera: un
 * patrón por día no tiene sentido para algo que toca una vez por semana.
 */
function valoresPorDia(series: HabitSeries[], desde: string, hasta: string, today: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const s of series) {
    if (s.frequency === "Semanal") continue;
    const m = new Map<string, number>();
    for (const r of slotStates(s, desde, hasta, today)) {
      if (r.state === "completed" || r.state === "skipped" || r.state === "missing") m.set(r.slot.start, r.pct);
    }
    out.set(s.habitId, m);
  }
  return out;
}

export function habitPatternsFacts(s: PatternsSnapshot): Fact[] {
  const facts: Fact[] = [];
  const { today } = s;
  const ayer = addDaysISO(today, -1);
  const desde = addDaysISO(today, -VENTANA);
  const nombre = new Map(s.habits.map((h) => [h.id, h.name]));
  const primerDia = s.series.map((x) => x.createdOn).sort()[0];
  const diasDeDatos = primerDia ? diffDays(primerDia, today) : 0;
  const hayHistoria = diasDeDatos >= MIN_DIAS_DATOS;

  // ------------------------------------------------------------ estado: rutinas
  for (const r of s.routines) {
    const suyas = s.series.filter((x) => s.habits.find((h) => h.id === x.habitId)?.routineId === r.id);
    const juzgadas = suyas.flatMap((x) => slotStates(x, addDaysISO(today, -89), ayer, today)).filter((e) => e.state !== "postponed" && e.state !== "pending");
    if (juzgadas.length < 14) continue;
    const pct = completionRate(suyas, addDaysISO(today, -89), ayer, today);
    if (pct === null) continue;
    facts.push({
      id: `habits.routine-rate.${r.id}`,
      domain: "habits",
      kind: "estado",
      label: `Completas "${r.name}" el ${pct} % de lo que toca (últimos ${Math.min(90, diasDeDatos)} días)`,
      weight: clampWeight(Math.abs(pct - 70) / 60),
      refs: [{ table: "routines", id: r.id }]
    });
  }

  // ----------------------------------------------------- estado: más omitido
  const omisiones = s.series
    .map((x) => ({
      habitId: x.habitId,
      n: slotStates(x, addDaysISO(today, -30), ayer, today).filter((e) => e.state === "skipped" || e.state === "missing").length,
      pct: completionRate([x], addDaysISO(today, -30), ayer, today)
    }))
    .filter((o) => o.n >= 5 && (o.pct ?? 100) < 70)
    .sort((a, b) => b.n - a.n)[0];
  if (omisiones && nombre.has(omisiones.habitId)) {
    facts.push({
      id: `habits.most-skipped.${omisiones.habitId}`,
      domain: "habits",
      kind: "estado",
      label: `"${nombre.get(omisiones.habitId)}" es el hábito que más se queda sin hacer: ${omisiones.n} veces en 30 días`,
      weight: clampWeight(omisiones.n / 20),
      refs: [{ table: "habits", id: omisiones.habitId }]
    });
  }

  if (!hayHistoria) return facts;

  const valores = valoresPorDia(s.series, desde, ayer, today);

  // Cumplimiento medio del día entre todos los hábitos juzgados ese día.
  const porDia = new Map<string, number>();
  for (let d = desde; d <= ayer; d = addDaysISO(d, 1)) {
    const m = media([...valores.values()].map((v) => v.get(d)).filter((x): x is number => x !== undefined));
    if (m !== null) porDia.set(d, m);
  }

  // -------------------------------------------------- tendencia: día flojo
  const general = media([...porDia.values()]);
  if (general !== null) {
    const peor = [0, 1, 2, 3, 4, 5, 6]
      .map((dow) => {
        const xs = [...porDia.entries()].filter(([d]) => new Date(`${d}T00:00:00Z`).getUTCDay() === dow).map(([, v]) => v);
        return { dow, n: xs.length, m: media(xs) };
      })
      .filter((x) => x.n >= 6 && x.m !== null && general - x.m >= BRECHA)
      .sort((a, b) => a.m! - b.m!)[0];
    if (peor) {
      facts.push({
        id: `habits.weekday-dip.${peor.dow}`,
        domain: "habits",
        kind: "tendencia",
        label: `Tu cumplimiento baja los ${DIA[peor.dow]}: ${Math.round(peor.m!)} % frente a ${Math.round(general)} % de media (12 semanas)`,
        weight: clampWeight((general - peor.m!) / 50),
        refs: []
      });
    }
  }

  // ------------------------------------- correlación: el hábito que acompaña
  const lifts: { habitId: string; con: number; sin: number }[] = [];
  for (const [habitId, suyos] of valores) {
    const con: number[] = [];
    const sin: number[] = [];
    for (const [d, v] of suyos) {
      const otros = media(
        [...valores.entries()].filter(([id]) => id !== habitId).map(([, m]) => m.get(d)).filter((x): x is number => x !== undefined)
      );
      if (otros === null) continue;
      (v > 0 ? con : sin).push(otros);
    }
    if (con.length < MIN_DIAS_LADO || sin.length < MIN_DIAS_LADO) continue;
    const mc = media(con)!;
    const ms = media(sin)!;
    if (mc - ms >= BRECHA) lifts.push({ habitId, con: mc, sin: ms });
  }
  for (const l of lifts.sort((a, b) => b.con - b.sin - (a.con - a.sin)).slice(0, 2)) {
    if (!nombre.has(l.habitId)) continue;
    facts.push({
      id: `habits.lift.${l.habitId}`,
      domain: "habits",
      kind: "correlacion",
      label: `Los días que haces "${nombre.get(l.habitId)}", completas el ${Math.round(l.con)} % del resto de tus hábitos; los días que no, el ${Math.round(l.sin)} % (asociación en 12 semanas)`,
      weight: clampWeight((l.con - l.sin) / 60),
      refs: [{ table: "habits", id: l.habitId }]
    });
  }

  // ---------------------------------- correlación: sueño y energía del check-in
  const conDato = s.checkins.filter((c) => c.date >= desde && c.date <= ayer);
  const condiciones = [
    {
      clave: "sleep",
      tabla: "daily_reflections",
      baja: (c: PatternsSnapshot["checkins"][number]) => c.sleepHours !== null && c.sleepHours < 6,
      normal: (c: PatternsSnapshot["checkins"][number]) => c.sleepHours !== null && c.sleepHours >= 6,
      texto: "Con menos de 6 h de sueño"
    },
    {
      clave: "energy",
      tabla: "daily_reflections",
      baja: (c: PatternsSnapshot["checkins"][number]) => c.energy !== null && c.energy <= 2,
      normal: (c: PatternsSnapshot["checkins"][number]) => c.energy !== null && c.energy >= 3,
      texto: "Con la energía baja (2 o menos)"
    }
  ];
  for (const cond of condiciones) {
    const bajos = conDato.filter(cond.baja);
    const normales = conDato.filter(cond.normal);
    if (bajos.length < MIN_DIAS_LADO || normales.length < MIN_DIAS_LADO) continue;

    const candidatos = [...valores.entries()]
      .map(([habitId, m]) => {
        const vb = bajos.map((c) => m.get(c.date)).filter((x): x is number => x !== undefined);
        const vn = normales.map((c) => m.get(c.date)).filter((x): x is number => x !== undefined);
        if (vb.length < MIN_DIAS_LADO || vn.length < MIN_DIAS_LADO) return null;
        return { habitId, bajo: media(vb)!, normal: media(vn)! };
      })
      .filter((x): x is { habitId: string; bajo: number; normal: number } => x !== null && x.normal - x.bajo >= BRECHA)
      .sort((a, b) => b.normal - b.bajo - (a.normal - a.bajo));

    const top = candidatos[0];
    if (!top || !nombre.has(top.habitId)) continue;
    const ultimo = bajos[bajos.length - 1]!;
    facts.push({
      id: `habits.${cond.clave}.${top.habitId}`,
      domain: "habits",
      kind: "correlacion",
      label: `${cond.texto} completas "${nombre.get(top.habitId)}" el ${Math.round(top.bajo)} % de las veces; el resto de los días, el ${Math.round(top.normal)} % (asociación en ${bajos.length + normales.length} check-ins)`,
      weight: clampWeight((top.normal - top.bajo) / 60),
      refs: [
        { table: cond.tabla, id: ultimo.id ?? ultimo.date },
        { table: "habits", id: top.habitId }
      ]
    });
  }

  // ------------------------------------------------ tendencia: caída reciente
  const r7 = completionRate(s.series, addDaysISO(today, -7), ayer, today);
  const r30 = completionRate(s.series, addDaysISO(today, -30), ayer, today);
  if (r7 !== null && r30 !== null && r30 - r7 >= BRECHA) {
    facts.push({
      id: "habits.momentum-drop",
      domain: "habits",
      kind: "tendencia",
      label: `Esta semana cumples el ${r7} % de tus hábitos, frente al ${r30} % de los últimos 30 días`,
      weight: clampWeight((r30 - r7) / 40),
      refs: []
    });
  }

  return facts;
}
