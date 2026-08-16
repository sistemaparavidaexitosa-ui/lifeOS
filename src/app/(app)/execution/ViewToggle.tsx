// Selector de vistas (Fase 8 parcial). Alterna entre "Lista", "Tabla"
// (Fase 3, NUEVO) y "Kanban" (Fase 2). Server Component puro, usa <Link>
// con query params, mismo patrón que "?project=" y "?period=" ya usados en
// el repo.

import Link from "next/link";

export type ExecutionView = "list" | "table" | "kanban";

export default function ViewToggle({ projectId, view }: { projectId: string; view: ExecutionView }) {
  const base = `/execution?project=${projectId}`;
  return (
    <div className="row" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Link href={`${base}&view=list`} className={view === "list" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
        Lista
      </Link>
      <Link href={`${base}&view=table`} className={view === "table" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
        Tabla
      </Link>
      <Link href={`${base}&view=kanban`} className={view === "kanban" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
        Kanban
      </Link>
    </div>
  );
}
