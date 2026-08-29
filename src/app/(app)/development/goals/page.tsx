import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Progress } from "@/components/ui";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { loadSourceSnapshot } from "@/lib/data/development";
import { getPersonalWorkspaceIds } from "@/lib/data/workspaces";
import { keyResultProgress, goalProgress, goalAtRisk, type KeyResultSourceKind } from "@/lib/domain/development/goals.ts";
import { CardHeader, ModuleNote, SectionHeader } from "../FormSheet";
import GoalForm from "./GoalForm";
import KeyResultForm, { type SourceOptions } from "./KeyResultForm";
import { getSessionUser } from "@/lib/data/session";

export default async function PersonalGoalsPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const personalWorkspaceIds = await getPersonalWorkspaceIds();

  const [{ data: goals }, { data: krs }, { data: habits }, { data: projects }, { data: books }, { data: fgoals }, { data: sgoals }] =
    await Promise.all([
      supabase.from("personal_goals").select("*").order("created_at"),
      supabase.from("key_results").select("*").order("position"),
      supabase.from("habits").select("id, name").order("name"),
      // BR-012: solo proyectos PERSONALES. Un resultado clave nunca se mide
      // contra el trabajo de un equipo. "Personal" es ahora "en un workspace
      // personal" (is_personal, 0030), no "sin workspace": esa segunda clase
      // de proyecto ya no existe.
      supabase.from("projects").select("id, title").in("workspace_id", personalWorkspaceIds).order("title"),
      supabase.from("books").select("id, title").order("title"),
      supabase.from("financial_goals").select("id, name").order("name"),
      supabase.from("savings_goals").select("id, name").order("name")
    ]);

  const today = todayLocal(await getUserTimeZone());
  const sources = await loadSourceSnapshot();

  const sourceOptions: SourceOptions = {
    habit: (habits ?? []).map((h) => ({ id: h.id, label: h.name })),
    project: (projects ?? []).map((p) => ({ id: p.id, label: p.title })),
    book: (books ?? []).map((b) => ({ id: b.id, label: b.title })),
    financial_goal: (fgoals ?? []).map((g) => ({ id: g.id, label: g.name })),
    savings_goal: (sgoals ?? []).map((g) => ({ id: g.id, label: g.name }))
  };

  const rows = (goals ?? []).map((g) => {
    const own = (krs ?? []).filter((k) => k.goal_id === g.id);
    const progress = own.map((k) => ({
      kr: k,
      p: keyResultProgress(
        {
          id: k.id,
          sourceKind: k.source_kind as KeyResultSourceKind,
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
      <ModuleNote>
        El progreso no se teclea. Cada resultado clave declara de dónde sale su número —un hábito, un proyecto personal, un
        libro o una meta financiera— y LifeOS lo calcula. Todo aquí es privado (BR-012).
      </ModuleNote>

      <SectionHeader action={<GoalForm />}>Metas Personales</SectionHeader>

      {!rows.length && (
        <Card>
          <EmptyState icon="🎯" text="Define tu primera meta personal. El progreso se calcula solo desde tus hábitos, proyectos y libros." />
        </Card>
      )}

      {rows.map(({ goal, progress, pct, atRisk }) => (
        <Card key={goal.id}>
          <CardHeader
            title={goal.title}
            meta={
              <>
                <Chip kind="info">{goal.area}</Chip>
                {goal.status !== "Activa" && <Chip>{goal.status}</Chip>}
                {atRisk && <Chip kind="bad">En riesgo</Chip>}
              </>
            }
            action={
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
            }
          />

          {goal.description && (
            <p className="text-xs mt-1.5" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
              {goal.description}
            </p>
          )}

          <div className="mt-2.5">
            <div className="flex justify-between gap-2 text-xs mb-1" style={{ color: "var(--muted)" }}>
              <span>{pct}% de avance</span>
              {goal.horizon && <span className="flex-shrink-0">horizonte {goal.horizon}</span>}
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
                {/* El título del resultado clave manda en su línea; la lectura y
                    el botón de editar caen debajo, envueltos entre sí. */}
                <div className="flex items-start gap-2">
                  <span className="grow min-w-0 text-sm" style={{ overflowWrap: "anywhere" }}>
                    {kr.title}
                  </span>
                  <span className="flex-shrink-0">
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
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  {p.stale ? (
                    <Chip kind="warn">fuente eliminada</Chip>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {p.current} / {p.target} {kr.unit}
                    </span>
                  )}
                </div>
                <div className="mt-1.5">
                  <Progress pct={p.pct} kind={p.stale ? "bad" : undefined} />
                </div>
              </div>
            ))}
            <KeyResultForm goalId={goal.id} sources={sourceOptions} block />
          </div>
        </Card>
      ))}
    </div>
  );
}
