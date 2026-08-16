"use client";

// FASE 4 — Bitácora (equivalente a logbookCard() en LifeOS 4.html). La tabla
// `logbook` ya existía en el esquema (0003_execution_collaboration.sql) con
// RLS/GRANTs correctos, pero no tenía ninguna UI — este componente cierra
// ese gap. Se renderiza junto a KnowledgeCard en un grid de 2 columnas al
// final del bloque "Tareas de: {proyecto}", igual que el HTML de referencia
// (grid g2: logbookCard(), knowledgeCard()).

import { useState, useTransition } from "react";
import { addLogEntry, deleteLogEntry, type LogEntry } from "./logbook-knowledge-actions";

const TYPE_LABEL: Record<LogEntry["type"], string> = {
  decision: "Decisión",
  change: "Cambio",
  comment: "Comentario",
  learning: "Aprendizaje"
};

const TYPE_CHIP: Record<LogEntry["type"], string> = {
  decision: "chip accent",
  change: "chip warn",
  comment: "chip",
  learning: "chip ok"
};

export default function LogbookCard({ projectId, entries }: { projectId: string; entries: LogEntry[] }) {
  const [type, setType] = useState<LogEntry["type"]>("decision");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card" style={{ background: "var(--surface)" }}>
      <b className="text-sm">Bitácora</b>
      <div className="text-xs" style={{ color: "var(--muted)", margin: "4px 0 8px" }}>
        Decisiones, cambios, comentarios y aprendizajes del proyecto (FR-EXE-007/012).
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
        {!entries.length && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Sin entradas todavía.
          </div>
        )}
        {entries.map((e) => (
          <div key={e.id} style={{ background: "var(--surface2)", borderRadius: 12, padding: "8px 10px" }}>
            <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span className={TYPE_CHIP[e.type]} style={{ fontSize: 10 }}>
                {TYPE_LABEL[e.type]}
              </span>
              <button
                className="text-xs"
                style={{ color: "var(--danger)", background: "none", border: 0, cursor: "pointer" }}
                onClick={() => startTransition(() => deleteLogEntry(e.id))}
                disabled={pending}
                aria-label="Eliminar entrada"
              >
                ✕
              </button>
            </div>
            <div className="text-sm" style={{ marginTop: 4 }}>
              {e.text}
            </div>
            <div className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
              {new Date(e.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <select value={type} onChange={(e) => setType(e.target.value as LogEntry["type"])}>
          <option value="decision">Decisión</option>
          <option value="change">Cambio</option>
          <option value="comment">Comentario</option>
          <option value="learning">Aprendizaje</option>
        </select>
        <textarea
          placeholder="Describe la decisión, cambio, comentario o aprendizaje..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
        />
        {error && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}
        <button
          className="btn-primary btn-sm"
          disabled={pending || !text.trim()}
          onClick={() =>
            startTransition(async () => {
              try {
                await addLogEntry(projectId, type, text);
                setText("");
                setError(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
              }
            })
          }
        >
          {pending ? "…" : "Agregar a bitácora"}
        </button>
      </div>
    </div>
  );
}
