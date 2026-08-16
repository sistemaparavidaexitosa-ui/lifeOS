// FASE 1 — Historial de estados de una tarea (solo lectura). La tabla
// task_history ya se poblaba desde setTaskStatus() y changeTaskQuadrant()
// (execution/actions.ts y execution/eisenhower/actions.ts), pero no existía
// ningún panel en la UI que la mostrara — este componente cierra ese gap
// (equivalente a taskHistoryPanel() en el HTML de referencia).
//
// Es un componente puro (sin "use client"): recibe los datos ya cargados
// como prop y solo renderiza — se usa dentro de TaskDetailPanel.tsx, que sí
// es "use client".

interface HistoryRow {
  id: string;
  from_state: string | null;
  to_state: string;
  ts: string;
}

export default function TaskHistoryPanel({ history }: { history: HistoryRow[] }) {
  return (
    <div className="card" style={{ background: "var(--surface)", marginTop: 8 }}>
      <b className="text-sm">Historial de estados</b>
      {!history.length && (
        <div className="text-xs" style={{ color: "var(--muted)", marginTop: 6 }}>
          Sin historial.
        </div>
      )}
      {history.map((h) => (
        <div key={h.id} className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
          {(h.from_state ?? "inicio")} → {h.to_state} · {new Date(h.ts).toLocaleString()}
        </div>
      ))}
    </div>
  );
}
