import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Progress } from "@/components/ui";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { loadSourceSnapshot } from "@/lib/data/development";
import { keyResultProgress, goalProgress, goalAtRisk } from "@/lib/domain/development/goals.ts";
import GoalForm from "./GoalForm";
import KeyResultForm, { type SourceOptions } from "./KeyResultForm";

export default async function PersonalGoalsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: goals }, { data: krs }, { data: habits }, { data: projects }, { data: books }, { data: fgoals }] =
    await Promise.all([
      supabase.from("personal_goals").select("*").order("created_at"),
      supabase.from("key_results").select("*").order("position"),
      supabase.from("habits").select("id, name").order("name"),
      // BR-012: solo proyectos PERSONALES. Un resultado clave nunca se mide
      // contra el trabajo de un equipo.
      supabase.from("projects").select("id, title").is("workspace_id", null).order("title"),
      supabase.from("books").select("id, title").order("title"),
      supabase.from("financial_goals").select("id, name").order("name")
    ]);

  const today = todayLocal(await getUserTimeZone());
  const sources = await loadSourceSnapshot();

  const sourceOptions: SourceOptions = {
    habit: (habits ?? []).map((h) => ({ id: h.id, label: h.name })),
    project: (projects ?? []).map((p) => ({ id: p.id, label: p.title })),
    book: (books ?? []).map((b) => ({ id: b.id, label: b.title })),
    financial_goal: (fgoals ?? []).map((g) => ({ id: g.id, label: g.name }))
  };

  const rows = (goals ?? []).map((g) => {
    const own = (krs ?? []).filter((k) => k.goal_id === g.id);
    const progress = own.map((k) => ({
      kr: k,
      p: keyResultProgress(
        {
          id: k.id,
          sourceKind: k.source_kind as "habit" | "project" | "book" | "financial_goal" | "manual",
          sourceId: k.source_id,
          target: Number(k.target),
          manualCurrent: Number(k.manual_current)
        },
        sources
      )
    }));
    const pct = goalProgress(progress.map((x) => x.p));
    const atRisk =
      g.horizon !== null && g.status === "Activa" ? goalAtRisk(g.created_at.slice(0, 10), g.horizon, pct, today) : false;
    return { goal: g, progress, pct, atRisk };
  });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--c-orange) 9%, var(--surface))", borderLeft: "3px solid var(--c-orange)" }}>
        El progreso no se teclea. Cada resultado clave declara de dónde sale su número —un hábito, un proyecto personal, un
        libro o una meta financiera— y LifeOS lo calcula. Todo aquí es privado (BR-012).
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Metas Personales</h3>
        <GoalForm />
      </div>

      {!rows.length && (
        <Card>
          <EmptyState icon="🎯" text="Define tu primera meta personal. El progreso se calcula solo desde tus hábitos, proyectos y libros." />
        </Card>
      )}

      {rows.map(({ goal, progress, pct, atRisk }) => (
        <Card key={goal.id}>
          <div className="flex items-center gap-2 flex-wrap">
            <b className="grow">{goal.title}</b>
            <Chip kind="info">{goal.area}</Chip>
            {goal.status !== "Activa" && <Chip>{goal.status}</Chip>}
            {atRisk && <Chip kind="bad">En riesgo</Chip>}
            <GoalForm
              goal={{
                id: goal.id,
                title: goal.title,
                description: goal.description,
                area: goal.area,
                horizon: goal.horizon,
                status: goal.status
              }}
            />
          </div>

          {goal.description && (
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {goal.description}
            </p>
          )}

          <div className="mt-2">
            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--muted)" }}>
              <span>{pct}% de avance</span>
              {goal.horizon && <span>horizonte {goal.horizon}</span>}
            </div>
            <Progress pct={pct} kind={atRisk ? "warn" : undefined} />
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {!progress.length && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Sin resultados clave todavía: una meta sin nada que medir se queda en 0 %.
              </p>
            )}
            {progress.map(({ kr, p }) => (
              <div key={kr.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="grow">{kr.title}</span>
                  {p.stale ? (
                    <Chip kind="warn">fuente eliminada</Chip>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {p.current} / {p.target} {kr.unit}
                    </span>
                  )}
                  <KeyResultForm
                    goalId={goal.id}
                    kr={{
                      id: kr.id,
                      title: kr.title,
                      sourceKind: kr.source_kind,
                      sourceId: kr.source_id,
                      target: Number(kr.target),
                      manualCurrent: Number(kr.manual_current),
                      unit: kr.unit
                    }}
                    sources={sourceOptions}
                  />
                </div>
                <div className="mt-1">
                  <Progress pct={p.pct} kind={p.stale ? "bad" : undefined} />
                </div>
              </div>
            ))}
            <div className="flex justify-end">
              <KeyResultForm goalId={goal.id} sources={sourceOptions} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
