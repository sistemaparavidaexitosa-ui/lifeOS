import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, Progress, EmptyState } from "@/components/ui";
import { fdate } from "@/lib/format";
import { todayLocal } from "@/lib/data/dates";
import DailyPlanForm from "./DailyPlanForm";
import CloseoutPanel from "./CloseoutPanel";
import WeeklyReviewPanel from "./WeeklyReviewPanel";

export default async function PlanningPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t0 = todayLocal();
  const [{ data: plan }, { data: projects }, { data: tasks }, { data: reviews }] = await Promise.all([
    supabase.from("daily_plans").select("*").eq("user_id", user.id).eq("local_date", t0).maybeSingle(),
    supabase.from("projects").select("id, title").eq("status", "Active"),
    supabase.from("tasks").select("id, title, project_id, est, status").not("status", "in", "(Completed,Cancelled)"),
    supabase.from("weekly_reviews").select("*").order("created_at", { ascending: false }).limit(10)
  ]);

  const impactTasksResult = await supabase.from("tasks").select("id, title, status").eq("impact", true);
  const impactTasks = impactTasksResult.data ?? [];
  const blockedCount = (tasks ?? []).filter((t) => t.status === "Blocked").length;
  const committedHours =
    (tasks ?? []).filter((t) => t.status !== "Completed" && t.status !== "Cancelled").reduce((s, t) => s + (t.est ?? 0), 0) / 60;
  const capacity = 20;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid md:grid-cols-2 gap-3.5">
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Planeación diaria</h3>
            <Chip kind={plan?.approved ? "ok" : "warn"}>{plan?.approved ? "Aprobado" : "Sin plan"}</Chip>
          </div>
          <p className="text-sm my-2" style={{ color: "var(--muted)" }}>
            Define tu Única Cosa y hasta 3 tareas de impacto para hoy.
          </p>
          {plan ? (
            <div className="text-sm">
              <b>{plan.one_thing}</b>
              <div className="text-xs my-1" style={{ color: "var(--muted)" }}>
                Tareas de impacto: {plan.task_ids?.length ?? 0}
              </div>
              {plan.approved && (
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Aprobado {fdate(plan.approved_at)}
                </div>
              )}
            </div>
          ) : (
            <EmptyState icon="🗓" text="Aún no planeas el día." />
          )}
          <details className="mt-2">
            <summary className="btn-primary" style={{ display: "inline-block", cursor: "pointer" }}>
              {plan ? "Editar plan" : "Planear hoy"}
            </summary>
            <div className="mt-3">
              <DailyPlanForm
                projects={projects ?? []}
                tasks={(tasks ?? []).map((t) => ({ id: t.id, title: t.title, project_id: t.project_id, est: t.est ?? 30 }))}
              />
            </div>
          </details>
        </Card>

        <Card>
          <h3 className="font-bold">Cierre diario</h3>
          <p className="text-sm my-2" style={{ color: "var(--muted)" }}>
            Registra qué completaste, qué se reprograma y qué aprendiste.
          </p>
          <CloseoutPanel impactTasks={impactTasks} />
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">Planeación semanal</h3>
        </div>
        <div className="flex items-center justify-between text-sm mb-1">
          <span>
            Capacidad {capacity} h · comprometidas {committedHours.toFixed(1)} h
          </span>
          <Chip kind={committedHours > capacity ? "bad" : "ok"}>{committedHours > capacity ? "Sobrecarga" : "En balance"}</Chip>
        </div>
        <Progress pct={(committedHours / capacity) * 100} kind={committedHours > capacity ? "bad" : undefined} />
        {committedHours > capacity && (
          <div className="text-xs p-2.5 rounded-r-xl mt-2" style={{ background: "color-mix(in srgb, var(--warn) 10%, var(--surface))", borderLeft: "3px solid var(--warn)" }}>
            La carga estimada supera tu capacidad (FR-PLN-003). Considera reprogramar o delegar.
          </div>
        )}
        <div className="mt-3">
          <WeeklyReviewPanel blockedCount={blockedCount} />
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Revisiones semanales (snapshots inmutables)</h3>
        {!reviews?.length && <EmptyState icon="📋" text="Sin revisiones aún." />}
        {(reviews ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="grow">
              <b className="text-sm">Semana al {fdate(r.review_date)}</b>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {r.completed_count} completadas · {r.progress_pct}% avance
              </div>
            </div>
            <Chip kind="ok">Inmutable</Chip>
          </div>
        ))}
      </Card>
    </div>
  );
}
