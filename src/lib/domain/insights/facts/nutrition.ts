// src/lib/domain/insights/facts/nutrition.ts
// Extractor de hechos de Nutrición — función pura: sin Supabase, sin red, sin
// `new Date()`. El día de corte entra como parámetro (D-016/D-018).
//
// DOS REGLAS QUE NO SON TÉCNICAS Y POR ESO VAN ARRIBA DEL TODO:
//
// 1. **Ningún hecho nombra un alimento.** «Registraste 3 donas» es exactamente
//    el detalle con juicio moral que hace que alguien borre la app. Aquí solo
//    se habla en agregados: kcal, gramos de macro, días. Lo comprueba una
//    prueba, porque es el tipo de regla que se erosiona sola.
//
// 2. **El techo de peso.** Solo el abandono del diario y el desvío de kcal
//    pueden acercarse a 1.0; los descriptivos topan en 0.4. El contexto se
//    recorta por peso (MAX_FACTS), y nada de nutrición debe desplazar de ahí
//    una racha de hábito rota de dos semanas.
//
// Y el desvío de calorías se reporta EN LAS DOS DIRECCIONES con el mismo peso.
// Comer un 20 % por debajo del objetivo no es «ir bien»: es otro desvío.

import { addDaysISO, diffDays } from "../../datetime.ts";
import {
  dailyTargets,
  latestWeight,
  loggingStreak,
  weightTrend,
  MEALS,
  type BodyProfileLike,
  type LoggedDay,
  type Meal,
  type Measurement
} from "../../development/nutrition.ts";
import { clampWeight, type Fact } from "../types.ts";

export interface NutritionSnapshot {
  profile: BodyProfileLike | null;
  days: LoggedDay[];
  measurements: Measurement[];
  /** Cuántos días de la ventana tienen registro de cada comida. */
  mealCounts?: Record<Meal, number>;
}

/** Ventana de observación, la misma que hábitos: un mes de conducta. */
const VENTANA = 30;
/** Ventana corta, para el desvío de kcal: dos semanas ya es una tendencia. */
const VENTANA_CORTA = 14;
/** Techo de los hechos descriptivos. Ver la regla 2 de la cabecera. */
const TECHO_DESCRIPTIVO = 0.4;

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function nutritionFacts(snapshot: NutritionSnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];
  const desde = addDaysISO(todayISO, -(VENTANA - 1));
  const enVentana = snapshot.days.filter((d) => d.date >= desde && d.date <= todayISO && d.entryCount > 0);

  // --- El diario se abandonó ------------------------------------------------
  // Se mira ANTES que nada porque es el único hallazgo que sigue siendo cierto
  // cuando ya no hay datos: precisamente su ausencia es el dato.
  const conRegistro = new Set(snapshot.days.filter((d) => d.entryCount > 0).map((d) => d.date));
  if (!conRegistro.has(todayISO)) {
    let ultimo: string | null = null;
    for (const d of snapshot.days) {
      if (d.entryCount > 0 && (!ultimo || d.date > ultimo)) ultimo = d.date;
    }
    if (ultimo) {
      const sinRegistrar = diffDays(ultimo, todayISO);
      const rachaPrevia = loggingStreak(snapshot.days, ultimo);
      // El umbral de 5 no es adorno: dejar de registrar dos días después de
      // empezar no es abandonar un hábito, es no haberlo tenido.
      if (sinRegistrar >= 2 && rachaPrevia >= 5) {
        facts.push({
          id: "nutrition.logging-dropped",
          domain: "nutrition",
          label: `El diario de comidas lleva ${sinRegistrar} días sin un registro, y antes venías de ${rachaPrevia} días seguidos.`,
          weight: clampWeight(sinRegistrar / VENTANA_CORTA),
          refs: []
        });
      }
    }
  }

  // --- Hay diario pero no hay perfil ----------------------------------------
  if (!snapshot.profile) {
    if (enVentana.length >= 5) {
      facts.push({
        id: "nutrition.no-profile",
        domain: "nutrition",
        label: `Hay ${enVentana.length} días de diario de comidas, pero ningún perfil corporal: no hay objetivo contra el que medirlos.`,
        weight: TECHO_DESCRIPTIVO,
        refs: []
      });
    }
    return facts;
  }

  const objetivos = dailyTargets(snapshot.profile, todayISO);
  const desdeCorta = addDaysISO(todayISO, -(VENTANA_CORTA - 1));
  const cortos = enVentana.filter((d) => d.date >= desdeCorta);

  // --- Desvío de calorías, en las dos direcciones ---------------------------
  if (cortos.length >= 10 && objetivos.kcal > 0) {
    const promedio = Math.round(media(cortos.map((d) => d.total.kcal)));
    const desvio = (promedio - objetivos.kcal) / objetivos.kcal;
    if (Math.abs(desvio) > 0.1) {
      const signo = desvio > 0 ? "por encima" : "por debajo";
      facts.push({
        id: "nutrition.kcal-drift",
        domain: "nutrition",
        label: `En los últimos ${VENTANA_CORTA} días promediaste ${promedio} kcal, un ${Math.abs(Math.round(desvio * 100))} % ${signo} de tu objetivo de ${objetivos.kcal}.`,
        weight: clampWeight(Math.abs(desvio) / 0.3),
        refs: []
      });
    }
  }

  // --- Proteína por debajo del objetivo -------------------------------------
  if (enVentana.length >= 10 && objetivos.proteinG > 0) {
    const promedio = Math.round(media(enVentana.map((d) => d.total.proteinG)));
    const razon = promedio / objetivos.proteinG;
    if (razon < 0.8) {
      facts.push({
        id: "nutrition.protein-gap",
        domain: "nutrition",
        label: `Tu objetivo son ${objetivos.proteinG} g de proteína al día y el promedio de los días registrados fue ${promedio} g (${Math.round(razon * 100)} %).`,
        weight: clampWeight((1 - razon) * 2),
        refs: []
      });
    }
  }

  // --- Una comida que casi nunca se registra --------------------------------
  if (snapshot.mealCounts && enVentana.length >= 15) {
    const cuentas = MEALS.map((m) => ({ meal: m, n: snapshot.mealCounts?.[m] ?? 0 }));
    const mayor = cuentas.reduce((a, b) => (a.n >= b.n ? a : b));
    const menor = cuentas.reduce((a, b) => (a.n <= b.n ? a : b));
    if (mayor.n > 0 && menor.n / mayor.n < 0.25) {
      facts.push({
        id: "nutrition.meal-skipped",
        domain: "nutrition",
        label: `Registraste ${menor.meal.toLowerCase()} ${menor.n} de ${enVentana.length} días, frente a ${mayor.n} de ${mayor.meal.toLowerCase()}.`,
        weight: TECHO_DESCRIPTIVO,
        refs: []
      });
    }
  }

  // --- Tendencia de peso -----------------------------------------------------
  const tendencia = weightTrend(snapshot.measurements, desde, todayISO);
  const actual = latestWeight(snapshot.measurements);
  if (tendencia && actual !== null && tendencia.dias >= 7) {
    const signo = tendencia.delta > 0 ? "+" : "−";
    facts.push({
      id: "nutrition.weight-trend",
      domain: "nutrition",
      label: `Peso: ${actual} kg, ${signo}${Math.abs(tendencia.delta)} kg en ${tendencia.dias} días (tendencia de 3 días, no básculas sueltas).`,
      weight: 0.7,
      refs: []
    });
  }

  return facts;
}
