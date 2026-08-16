// FASE 2 — Selector de vistas (adelanto parcial de la Fase 8 del plan de
// cierre de brechas). Por ahora solo alterna entre "Lista" y "Kanban", que
// son las dos vistas ya construidas; cuando se agreguen Tabla/Calendario/
// Gantt (Fases 3, 6, 7) solo hace falta sumar un <Link> más aquí.
//
// Server Component puro (sin "use client"): usa <Link> con query params,
// mismo patrón que "?project=" (execution/page.tsx) y "?period=" (reports).

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
