// Selector de vistas (adelanto parcial de la Fase 8). Alterna entre "Lista"
// y "Kanban". Server Component puro, usa <Link> con query params, mismo
// patrón que "?project=" y "?period=" ya usados en el repo.

import Link from "next/link";

export default function ViewToggle({ projectId, view }: { projectId: string; view: "list" | "kanban" }) {
  const base = `/execution?project=${projectId}`;
  return (
    <div className="row" style={{ display: "flex", gap: 6 }}>
      <Link href={`${base}&view=list`} className={view === "list" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
        Lista
      </Link>
      <Link href={`${base}&view=kanban`} className={view === "kanban" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
        Kanban
      </Link>
    </div>
  );
}
