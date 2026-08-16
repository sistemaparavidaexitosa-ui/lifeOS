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
