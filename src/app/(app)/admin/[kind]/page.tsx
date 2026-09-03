import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { listAdminTemplates } from "@/lib/data/templates";
import { TEMPLATE_KIND_LABEL, TEMPLATE_KINDS, type TemplateKind } from "@/lib/domain/templates/schema.ts";
import { templateSummary, type ProjectTemplate } from "@/lib/domain/execution/project-templates.ts";
import { routineTemplateDuration, type RoutineTemplate, type HabitTemplate } from "@/lib/domain/development/templates.ts";
import TemplateRows, { type AdminRow } from "../TemplateRows";

// La lista de un tipo: qué hay, en qué estado, y qué crea cada una.
//
// El resumen de cada fila lo calculan las MISMAS funciones que ejecuta la
// acción de aplicar (`templateSummary`, `routineTemplateDuration`). No hay una
// segunda cuenta escrita para el panel: si la hubiera, diría un número distinto
// al de la pantalla del usuario en cuanto una de las dos cambiara.

function esKind(v: string): v is TemplateKind {
  return (TEMPLATE_KINDS as readonly string[]).includes(v);
}

/** Una línea que diga qué crea la plantilla, sin abrirla. */
function resumir(kind: TemplateKind, t: ProjectTemplate | RoutineTemplate | HabitTemplate): string {
  if (kind === "project") {
    const { groups, tasks, subtasks } = templateSummary(t as ProjectTemplate);
    return `${groups} grupos · ${tasks} tareas${subtasks ? ` · ${subtasks} subtareas` : ""}`;
  }
  if (kind === "routine") {
    const r = t as RoutineTemplate;
    return `${r.steps.length} pasos · ${routineTemplateDuration(r)} min · ${r.frequency}`;
  }
  const h = t as HabitTemplate;
  return `${h.category} · ${h.frequency}`;
}

export default async function AdminKindPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!esKind(kind)) notFound();

  const filas = await listAdminTemplates(kind);
  const rows: AdminRow[] = filas.map((f) => ({
    slug: f.slug,
    name: f.template.name,
    status: f.status,
    resumen: resumir(kind, f.template)
  }));

  return (
    <>
      <Card hero>
        <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h2 className="font-bold">{TEMPLATE_KIND_LABEL[kind]}</h2>
          <Link href={`/admin/${kind}/nueva`} className="btn-primary btn-sm">
            + Nueva plantilla
          </Link>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon="📋" text="Todavía no hay plantillas de este tipo. Crea la primera." />
        </Card>
      ) : (
        <TemplateRows kind={kind} rows={rows} />
      )}
    </>
  );
}
