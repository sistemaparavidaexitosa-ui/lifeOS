// Selector de vistas. "Tablero" (rediseño Monday-style, NUEVO y default)
// reemplaza a la antigua vista "Tabla" — mismas columnas (Tarea, Personas,
// Estado, Fechas) pero con subtareas, pills de color, avatares y edición
// inline. Se conservan "Lista" y "Kanban" como vistas alternas. Server
// Component puro, usa <Link> con query params, mismo patrón que "?project="
// y "?period=" ya usados en el repo.

import Link from "next/link";

export type ExecutionView = "board" | "list" | "kanban";

export default function ViewToggle({ projectId, view }: { projectId: string; view: ExecutionView }) {
  const base = `/execution?project=${projectId}`;
  return (
    <div className="row" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Link href={`${base}&view=board`} className={view === "board" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
        📋 Tablero
      </Link>
      <Link href={`${base}&view=list`} className={view === "list" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
        Lista
      </Link>
      <Link href={`${base}&view=kanban`} className={view === "kanban" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
        Kanban
      </Link>
    </div>
  );
}
