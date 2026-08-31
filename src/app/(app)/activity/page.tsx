import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaces, type WorkspaceSummary } from "@/lib/data/workspaces";
import WorkspaceSwitcher from "@/components/workspace/WorkspaceSwitcher";
import WorkspaceTabs from "@/components/workspace/WorkspaceTabs";
import { Card, EmptyState } from "@/components/ui";
import { getSessionUser } from "@/lib/data/session";
import { activityLabel, groupByDay } from "@/lib/domain/execution/activity.ts";
import InsightSection from "@/components/InsightSection";

// ACTIVIDAD — lo que ha pasado en el espacio.
//
// `workspace_activity` existe desde la migración 0003 y hasta ahora era una
// tabla de SOLO ESCRITURA: cuatro Server Actions insertaban en ella y ninguna
// pantalla la leía. Todo lo que se registró desde entonces estaba ahí, invisible.
//
// Cuelga del espacio y no del menú lateral, igual que los cuadernos: es lo que
// ha ocurrido DENTRO de este espacio, no un módulo aparte.
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const { ws: requestedWorkspaceId } = await searchParams;

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspaces();
  const activeFromParam = workspaces.find((w) => w.id === requestedWorkspaceId);

  // Sin ?ws= válido se cae al espacio personal, igual que /execution y
  // /notebooks: desde 0030 siempre hay uno.
  const activeWorkspace: WorkspaceSummary | undefined =
    activeFromParam ?? workspaces.find((w) => w.isPersonal) ?? workspaces[0];

  if (!activeWorkspace) {
    return <Card>No encontramos ningún espacio de trabajo para tu cuenta.</Card>;
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspace.id} basePath="/activity" />
        <WorkspaceTabs workspaceId={activeWorkspace.id} />
      </div>

      {/* La consulta del feed no puede retrasar el conmutador de espacios: sin
          este límite, cambiar de espacio se sentiría lento por culpa de la
          lista que se está a punto de reemplazar. */}
      <Suspense fallback={<Card>Cargando actividad…</Card>}>
        <ActivityFeed workspaceId={activeWorkspace.id} />
      </Suspense>

      {/* «¿Qué me perdí?». Es el único ámbito del motor que habla del EQUIPO y
          no del usuario, y por eso vive aquí y no en Home: la pregunta que
          responde es de este espacio. */}
      <InsightSection scope="activity" />
    </div>
  );
}

/**
 * Tope del feed. Es un «qué ha pasado», no un archivo histórico.
 *
 * Sube a 200 porque ahora dejan rastro también crear tareas, mover estados y
 * tocar grupos: con 100, un día de trabajo normal de un equipo se comía el
 * feed entero y lo de anteayer dejaba de existir. Si llega a molestar, el
 * siguiente paso es agrupar por tipo dentro del día — no paginar, que
 * convertiría esto en el archivo que no quiere ser.
 */
const MAX_ROWS = 200;

async function ActivityFeed({ workspaceId }: { workspaceId: string }) {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("workspace_activity")
    .select("id, type, text, actor, project_id, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (!rows?.length) {
    return (
      <Card>
        <EmptyState
          icon="◷"
          text="Todavía no ha pasado nada en este espacio. Al crear un proyecto o una tarea, mover un estado o escribir en un hilo, aparecerá aquí con el nombre de quien lo hizo."
        />
      </Card>
    );
  }

  const days = groupByDay(
    rows.map((r) => ({ id: r.id, type: r.type, text: r.text, actor: r.actor, at: r.created_at, projectId: r.project_id }))
  );

  return (
    <>
      {days.map((day) => (
        <Card key={day.dateISO}>
          <div className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {new Date(`${day.dateISO}T12:00:00Z`).toLocaleDateString("es-MX", {
              weekday: "long",
              day: "numeric",
              month: "long"
            })}
          </div>
          {day.entries.map((e) => (
            <div
              key={e.id}
              className="flex items-baseline gap-2 flex-wrap"
              style={{ borderTop: "1px solid var(--line)", padding: "9px 0" }}
            >
              <span className="text-xs font-bold" style={{ color: "var(--c-purple)" }}>
                {activityLabel(e.type)}
              </span>
              <span className="text-sm grow min-w-0">{e.text}</span>
              {e.projectId && (
                <Link className="btn-ghost btn-sm" href={`/execution?project=${e.projectId}`}>
                  Abrir
                </Link>
              )}
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {e.actor} · {new Date(e.at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </Card>
      ))}
    </>
  );
}
