"use client";
// El HILO de una tarea: comentarios y cambios de estado en una sola corriente.
//
// Antes eran dos tarjetas apiladas —toda la conversación, y debajo toda la
// cronología— con dos relojes que además iban en sentidos opuestos. Para saber
// si un comentario se escribió antes o después de que la tarea se bloqueara
// había que cruzar dos listas a ojo. Son el mismo hilo: un cambio de estado es
// lo que en un chat serían los mensajitos grises de sistema, y es justo lo que
// explica por qué el comentario siguiente dice lo que dice.
//
// El orden y el formato viven en domain/execution/thread.ts, probados sin
// React. Aquí solo se pinta.

import { useMemo, useRef, useState, useTransition } from "react";
import { addTaskComment } from "./task-detail-actions";
import { createReminder, pinCommentToLogbook, reactDone, toggleReaction, type PinType } from "./thread-actions";
import {
  summarizeReactions,
  toggleIntent,
  DONE_EMOJI,
  REACTION_PALETTE,
  type ReactionLike
} from "@/lib/domain/execution/reactions.ts";
import { PRESET_LABEL, type ReminderPreset } from "@/lib/domain/execution/reminders.ts";
import { mergeThread, describeTransition } from "@/lib/domain/execution/thread.ts";
import { matchRoster, mentionQueryAt, splitBody, type RosterMember } from "@/lib/domain/execution/mentions.ts";
import { STATUS_META } from "./status-meta";
import type { TaskStatus } from "@/lib/domain/types.ts";
import MenuSurface from "@/components/MenuSurface";

interface CommentLite {
  id: string;
  body: string;
  author_name: string;
  mentions: string[];
  created_at: string;
}

interface ReactionLite {
  comment_id: string;
  user_id: string;
  emoji: string;
}

interface HistoryLite {
  id: string;
  from_state: string | null;
  to_state: string;
  ts: string;
}

/** El nombre legible de un estado, o el crudo si algún día aparece uno nuevo. */
function stateLabel(state: string): string {
  return STATUS_META[state as TaskStatus]?.label ?? state;
}

function CommentBody({ body, roster }: { body: string; roster: RosterMember[] }) {
  const segments = useMemo(() => splitBody(body, roster), [body, roster]);
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "mention" ? (
          <span key={i} style={{ color: "var(--accent-d)", fontWeight: 800 }}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}

const PRESETS: ReminderPreset[] = ["manana", "en-3-dias", "proxima-semana"];

export default function TaskThreadPanel({
  taskId,
  comments,
  history,
  reactions,
  viewerId,
  roster,
  onSaved
}: {
  taskId: string;
  comments: CommentLite[];
  history: HistoryLite[];
  reactions: ReactionLite[];
  viewerId: string;
  roster: RosterMember[];
  onSaved: () => void;
}) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // El menú de menciones se ancla al propio campo: nace justo debajo de donde
  // se está escribiendo, y MenuSurface se encarga de voltearlo si no cabe.
  const [mentionAnchor, setMentionAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);

  const entries = useMemo(
    () =>
      mergeThread(
        comments.map((c) => ({ id: c.id, body: c.body, authorName: c.author_name, createdAt: c.created_at })),
        history.map((h) => ({ id: h.id, fromState: h.from_state, toState: h.to_state, ts: h.ts }))
      ),
    [comments, history]
  );

  const candidates = useMemo(() => (query === null ? [] : matchRoster(roster, query).slice(0, 6)), [roster, query]);

  const reactionRows: ReactionLike[] = useMemo(
    () => reactions.map((r) => ({ commentId: r.comment_id, userId: r.user_id, emoji: r.emoji })),
    [reactions]
  );

  /** El menú de acciones abierto, si hay alguno: un comentario a la vez. */
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);

  function react(commentId: string, emoji: string) {
    const intent = toggleIntent(reactionRows, commentId, viewerId, emoji);
    startTransition(async () => {
      // El ✅ es el único que además intenta cerrar la tarea; el resto solo
      // reacciona. Por eso son dos acciones y no una con un `if` dentro.
      const result = emoji === DONE_EMOJI ? await reactDone(commentId, taskId, intent) : await toggleReaction(commentId, emoji, intent);
      setError(result.ok ? null : (result.reason ?? "No se pudo reaccionar."));
      onSaved();
    });
  }

  function pin(commentId: string, type: PinType) {
    setOpenFor(null);
    setActionAnchor(null);
    startTransition(async () => {
      const result = await pinCommentToLogbook(commentId, type);
      setError(result.ok ? null : (result.reason ?? "No se pudo fijar."));
    });
  }

  function remind(commentId: string, preset: ReminderPreset) {
    setOpenFor(null);
    setActionAnchor(null);
    startTransition(async () => {
      const result = await createReminder("comment", commentId, preset, "");
      setError(result.ok ? null : (result.reason ?? "No se pudo crear el recordatorio."));
    });
  }

  function onType(value: string, caret: number) {
    setBody(value);
    const q = mentionQueryAt(value, caret);
    setQuery(q);
    setMentionAnchor(q === null ? null : inputRef.current);
  }

  /** Sustituye el fragmento que se estaba tecleando por el nombre completo. */
  function pick(member: RosterMember) {
    const caret = inputRef.current?.selectionStart ?? body.length;
    const upto = body.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return;
    const next = `${body.slice(0, at)}@${member.name} ${body.slice(caret)}`;
    setBody(next);
    setQuery(null);
    setMentionAnchor(null);
    inputRef.current?.focus();
  }

  function send() {
    startTransition(async () => {
      try {
        await addTaskComment(taskId, body);
        setBody("");
        setError(null);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <div className="card" style={{ background: "var(--surface)", marginTop: 8 }}>
      <b className="text-sm">Hilo</b>
      {!entries.length && (
        <div className="text-xs" style={{ color: "var(--muted)", margin: "6px 0" }}>
          Sin actividad todavía. Usa @ para mencionar a alguien del espacio.
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        {entries.map((e) =>
          e.kind === "system" ? (
            <div key={e.id} className="text-xs" style={{ color: "var(--muted)", margin: "8px 0 8px 2px" }}>
              {describeTransition(e.fromState && stateLabel(e.fromState), stateLabel(e.toState))} ·{" "}
              {new Date(e.at).toLocaleString()}
            </div>
          ) : (
            <div
              key={e.id}
              style={{ background: "var(--surface2)", borderRadius: 12, padding: "9px 11px", margin: "8px 0" }}
            >
              <div className="text-sm">
                <CommentBody body={e.body} roster={roster} />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6 }}>
                {summarizeReactions(reactionRows, e.id, viewerId).map((rx) => (
                  <button
                    key={rx.emoji}
                    className={`btn-ghost btn-sm${rx.mine ? " btn-primary" : ""}`}
                    style={{ padding: "2px 8px", minHeight: 26 }}
                    disabled={pending}
                    onClick={() => react(e.id, rx.emoji)}
                    aria-label={`${rx.emoji} · ${rx.count}${rx.mine ? " · reaccionaste" : ""}`}
                  >
                    {rx.emoji} {rx.count}
                  </button>
                ))}
                <button
                  className="btn-ghost btn-sm"
                  style={{ padding: "2px 8px", minHeight: 26 }}
                  disabled={pending}
                  onClick={(ev) => {
                    setOpenFor(openFor === e.id ? null : e.id);
                    setActionAnchor(openFor === e.id ? null : ev.currentTarget);
                  }}
                  aria-label="Reaccionar, fijar o recordar"
                >
                  ⋯
                </button>
              </div>

              <div className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
                {e.authorName} · {new Date(e.at).toLocaleString()}
              </div>
            </div>
          )
        )}
      </div>

      <div className="row" style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          placeholder="Escribe un comentario, usa @ para mencionar…"
          value={body}
          onChange={(e) => onType(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={(e) => {
            // Con el menú abierto, Enter elige al primero en vez de enviar a
            // medio escribir el nombre.
            if (e.key === "Enter" && candidates.length && query !== null) {
              e.preventDefault();
              const first = candidates[0];
              if (first) pick(first);
              return;
            }
            if (e.key === "Enter" && body.trim() && !pending) send();
            if (e.key === "Escape" && query !== null) {
              setQuery(null);
              setMentionAnchor(null);
            }
          }}
        />
        <button className="btn-primary btn-sm" disabled={pending || !body.trim()} onClick={send}>
          {pending ? "…" : "Enviar"}
        </button>
      </div>

      {mentionAnchor && candidates.length > 0 && (
        <MenuSurface
          anchor={mentionAnchor}
          align="start"
          width={220}
          label="Mencionar a alguien del espacio"
          onClose={() => {
            setQuery(null);
            setMentionAnchor(null);
          }}
        >
          {candidates.map((m) => (
            <button key={m.userId} className="ex-menu-item" onClick={() => pick(m)}>
              {m.name}
            </button>
          ))}
        </MenuSurface>
      )}

      {openFor && actionAnchor && (
        <MenuSurface
          anchor={actionAnchor}
          align="start"
          width={228}
          label="Acciones sobre el comentario"
          onClose={() => {
            setOpenFor(null);
            setActionAnchor(null);
          }}
        >
          <div className="flex gap-1 flex-wrap" style={{ padding: "6px 8px" }}>
            {REACTION_PALETTE.map((emoji) => (
              <button
                key={emoji}
                className="btn-ghost btn-sm"
                style={{ padding: "2px 8px", minHeight: 28 }}
                disabled={pending}
                onClick={() => {
                  const id = openFor;
                  setOpenFor(null);
                  setActionAnchor(null);
                  react(id, emoji);
                }}
                aria-label={emoji === DONE_EMOJI ? "Marcar como hecho (completa la tarea)" : `Reaccionar con ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button className="ex-menu-item" disabled={pending} onClick={() => pin(openFor, "decision")}>
            Fijar como decisión
          </button>
          <button className="ex-menu-item" disabled={pending} onClick={() => pin(openFor, "learning")}>
            Fijar como aprendizaje
          </button>
          {PRESETS.map((preset) => (
            <button key={preset} className="ex-menu-item" disabled={pending} onClick={() => remind(openFor, preset)}>
              Recordarme: {PRESET_LABEL[preset].toLowerCase()}
            </button>
          ))}
        </MenuSurface>
      )}

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)", marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}
