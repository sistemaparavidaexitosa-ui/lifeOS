"use client";

import { useState, useTransition } from "react";
import { addTaskComment } from "./task-detail-actions";

interface CommentLite {
  id: string;
  body: string;
  author_name: string;
  mentions: string[];
  created_at: string;
}

function renderMentions(body: string) {
  const parts = body.split(/(@[\wÀ-ÿ]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} style={{ color: "var(--accent-d)", fontWeight: 800 }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function TaskCommentsPanel({
  taskId,
  comments,
  onSaved
}: {
  taskId: string;
  comments: CommentLite[];
  onSaved: () => void;
}) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card" style={{ background: "var(--surface)", marginTop: 8 }}>
      <b className="text-sm">Comentarios y menciones</b>
      {!comments.length && (
        <div className="text-xs" style={{ color: "var(--muted)", margin: "6px 0" }}>
          Sin comentarios. Usa @nombre para mencionar.
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        {comments.map((c) => (
          <div
            key={c.id}
            style={{ background: "var(--surface2)", borderRadius: 12, padding: "9px 11px", margin: "8px 0" }}
          >
            <div className="text-sm">{renderMentions(c.body)}</div>
            <div className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
              {c.author_name} · {new Date(c.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <input
          placeholder="Escribe un comentario, usa @nombre..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          className="btn-primary btn-sm"
          disabled={pending || !body.trim()}
          onClick={() =>
            startTransition(async () => {
              try {
                await addTaskComment(taskId, body);
                setBody("");
                setError(null);
                onSaved();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
              }
            })
          }
        >
          {pending ? "…" : "Enviar"}
        </button>
      </div>
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)", marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}
