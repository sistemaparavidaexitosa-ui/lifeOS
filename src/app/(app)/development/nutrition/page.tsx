import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Progress, Stat } from "@/components/ui";
import { todayLocal, addDaysISO } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import {
  dailyTargets,
  latestWeight,
  loggingStreak,
  macrosByMeal,
  macroSplitPct,
  nutritionAdherencePct,
  sumMacros,
  targetProgress,
  weightTrend,
  MEALS,
  type ActivityLevel,
  type LoggedDay,
  type Meal,
  type NutritionGoal,
  type Sex
} from "@/lib/domain/development/nutrition.ts";
import { CardHeader, ModuleNote, SectionHeader } from "../FormSheet";
import BodyProfileForm from "./BodyProfileForm";
import WeightForm from "./WeightForm";
import FoodSearchForm from "./FoodSearchForm";
import EntryRow from "./EntryRow";
import { getSessionUser } from "@/lib/data/session";

/**
 * Diario de nutrición.
 *
 * NO CALCULA NADA. Lee filas, las traduce a la forma que piden las funciones
 * puras de `domain/development/nutrition.ts` y pinta lo que devuelven. Si aquí
 * aparece aritmética nueva, va en el dominio — misma regla que el resto del
 * módulo.
 */
export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const hoy = todayLocal(await getUserTimeZone());
  const { dia: diaPedido } = await searchParams;
  // El día se valida contra el calendario del usuario y no se confía en la URL:
  // una fecha futura o de hace diez años solo produce una pantalla vacía que
  // parece un error de la app.
  const dia =
    diaPedido && /^\d{4}-\d{2}-\d{2}$/.test(diaPedido) && diaPedido <= hoy && diaPedido >= addDaysISO(hoy, -365)
      ? diaPedido
      : hoy;

  // Ventana de 30 días para adherencia, racha y tendencia. Con ~4 entradas al
  // día son unas 120 filas, muy por debajo del `max_rows = 1000` que trunca en
  // silencio (mismo motivo que en /development/routines).
  const desde = addDaysISO(hoy, -29);

  const [{ data: perfil }, { data: delDia }, { data: ventana }, { data: pesos }, { data: gastos }] = await Promise.all([
    supabase.from("nutrition_profiles").select("*").maybeSingle(),
    supabase
      .from("food_entries")
      .select("id, meal, name, brand, grams, kcal, protein_g, carbs_g, fat_g, position")
      .eq("local_date", dia)
      .order("meal")
      .order("position"),
    supabase
      .from("food_entries")
      .select("local_date, kcal, protein_g, carbs_g, fat_g")
      .gte("local_date", desde)
      .lte("local_date", hoy),
    supabase.from("body_measurements").select("local_date, weight_kg").gte("local_date", desde).lte("local_date", hoy),
    // Money OS. Dos cifras ciertas puestas al lado, NUNCA un join: ver la nota
    // al pie de esta página.
    supabase
      .from("journal_entries")
      .select("id")
      .eq("category", "Alimentación")
      .gte("entry_date", `${hoy.slice(0, 7)}-01`)
      .lte("entry_date", hoy)
  ]);

  const entradas = (delDia ?? []).map((e) => ({
    id: e.id,
    meal: e.meal as Meal,
    name: e.name,
    brand: e.brand,
    grams: Number(e.grams),
    kcal: Number(e.kcal),
    proteinG: Number(e.protein_g),
    carbsG: Number(e.carbs_g),
    fatG: Number(e.fat_g)
  }));

  const porComida = macrosByMeal(entradas);
  const totalDia = sumMacros(entradas);

  const perfilLike = perfil
    ? {
        sex: (perfil.sex === "Mujer" ? "Mujer" : "Hombre") as Sex,
        birthDate: perfil.birth_date,
        heightCm: Number(perfil.height_cm),
        weightKg: Number(perfil.weight_kg),
        activityLevel: perfil.activity_level as ActivityLevel,
        goal: perfil.goal as NutritionGoal,
        proteinGPerKg: Number(perfil.protein_g_per_kg),
        fatPct: perfil.fat_pct,
        kcalOverride: perfil.kcal_override
      }
    : null;

  const objetivos = perfilLike ? dailyTargets(perfilLike, hoy) : null;
  const progreso = objetivos ? targetProgress(totalDia, objetivos) : null;
  const reparto = macroSplitPct(totalDia);

  const porDia = new Map<string, { kcal: number; n: number }>();
  for (const e of ventana ?? []) {
    const acc = porDia.get(e.local_date) ?? { kcal: 0, n: 0 };
    porDia.set(e.local_date, { kcal: acc.kcal + Number(e.kcal), n: acc.n + 1 });
  }
  const dias: LoggedDay[] = [...porDia.entries()].map(([date, v]) => ({
    date,
    total: { kcal: v.kcal, proteinG: 0, carbsG: 0, fatG: 0 },
    entryCount: v.n
  }));

  const mediciones = (pesos ?? []).map((m) => ({ localDate: m.local_date, weightKg: Number(m.weight_kg) }));
  const adherencia = objetivos ? nutritionAdherencePct(dias, objetivos, desde, hoy) : 0;
  const racha = loggingStreak(dias, hoy);
  const tendencia = weightTrend(mediciones, desde, hoy);
  const peso = latestWeight(mediciones) ?? perfilLike?.weightKg ?? null;
  const diasConDiario = dias.filter((d) => d.entryCount > 0).length;

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader
          title={dia === hoy ? "Hoy" : dia}
          meta={
            objetivos ? (
              <>
                {totalDia.kcal} / {objetivos.kcal} kcal
                {objetivos.floored && (
                  <>
                    {" "}
                    <Chip kind="warn">objetivo en el suelo</Chip>
                  </>
                )}
              </>
            ) : (
              "Sin perfil corporal"
            )
          }
          action={<BodyProfileForm perfil={perfilLike ? { ...perfilLike } : null} />}
        />

        {objetivos && progreso ? (
          <div className="flex flex-col gap-2 mt-2.5">
            <Progress pct={Math.min(100, progreso.kcal.pct)} kind={progreso.kcal.over ? "warn" : undefined} />
            <div className="flex gap-2 flex-wrap">
              <Stat label="Proteína" value={`${totalDia.proteinG} / ${objetivos.proteinG} g`} />
              <Stat label="Carbohidratos" value={`${totalDia.carbsG} / ${objetivos.carbsG} g`} />
              <Stat label="Grasa" value={`${totalDia.fatG} / ${objetivos.fatG} g`} />
            </div>
            {totalDia.kcal > 0 && (
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Reparto de hoy: {reparto.protein} % proteína · {reparto.carbs} % carbohidratos · {reparto.fat} % grasa.
              </div>
            )}
            {objetivos.impossibleSplit && (
              <ModuleNote>
                Con esa proteína y esa grasa no caben carbohidratos dentro del objetivo de calorías. Baja alguno de los
                dos porcentajes en el perfil.
              </ModuleNote>
            )}
          </div>
        ) : (
          <div className="mt-2.5">
            <EmptyState icon="🍎" text="Falta tu perfil corporal: sin él se puede registrar, pero no hay objetivo contra el que medir el día." />
          </div>
        )}
      </Card>

      {MEALS.map((comida) => {
        const suyas = entradas.filter((e) => e.meal === comida);
        return (
          <Card key={comida}>
            <CardHeader
              title={comida}
              meta={`${porComida[comida].kcal} kcal`}
              action={<FoodSearchForm localDate={dia} meal={comida} />}
            />
            <div className="flex flex-col gap-1 mt-2.5">
              {suyas.length ? (
                suyas.map((e) => <EntryRow key={e.id} id={e.id} name={e.name} brand={e.brand} grams={e.grams} kcal={e.kcal} />)
              ) : (
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Sin registrar.
                </div>
              )}
            </div>
          </Card>
        );
      })}

      <Card>
        <CardHeader
          title="Peso y constancia"
          meta={peso !== null ? `${peso} kg` : "Sin mediciones"}
          action={<WeightForm actual={peso} />}
        />
        <div className="flex gap-2 flex-wrap mt-2.5">
          <Stat label="Adherencia (30 d)" value={`${adherencia} %`} />
          <Stat label="Racha de registro" value={`${racha} d`} />
          {tendencia && <Stat label={`Tendencia (${tendencia.dias} d)`} value={`${tendencia.delta > 0 ? "+" : "−"}${Math.abs(tendencia.delta)} kg`} />}
        </div>
        <ModuleNote>
          La adherencia cuenta los días DENTRO de ±10 % de tu objetivo, y los días sin registrar cuentan como no
          cumplidos. Quedarse corto también es un desvío: la banda es simétrica a propósito.
        </ModuleNote>
      </Card>

      <Card>
        <SectionHeader>Este mes</SectionHeader>
        <div className="flex gap-2 flex-wrap mt-2.5">
          <Stat label="Movimientos en «Alimentación»" value={String((gastos ?? []).length)} />
          <Stat label="Días con diario" value={`${diasConDiario} de 30`} />
        </div>
        <ModuleNote>
          Son dos cifras ciertas puestas al lado, no un cálculo. El sistema <strong>no sabe</strong> qué comida pagó ese
          dinero: un movimiento de Money OS es un importe y una fecha, sin renglones de producto. Y los días sin
          registrar también se comieron. Cualquier división entre ambas es una referencia, no un coste.
        </ModuleNote>
      </Card>
    </div>
  );
}
