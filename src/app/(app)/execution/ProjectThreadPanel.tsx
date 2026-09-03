"use client";
// LA PESTAÑA «HILO» DE UN PROYECTO.
//
// POR QUÉ EXISTE
// La conversación del equipo solo cabía DENTRO de una tarea. Un mensaje como
// «@Victor, dejé cargado el último commit, favor de aplicar las migraciones» no
// pertenece a ninguna tarea concreta, así que acababa colgado de una cualquiera
// —la que estuviera abierta— y allí se perdía. Aquí tiene su sitio.
//
// Y ES SOLO UN CHAT
// Aquí se intercalaban los eventos del proyecto —quién creó una tarea, quién
// movió un estado— como los mensajitos grises de un chat. Se quitaron: esa
// pregunta («qué ha pasado aquí») ya la contesta /activity, que los enseña
// completos y agrupados por día, y repetirlos aquí enterraba la conversación
// bajo su propio ruido. El hilo contesta la otra pregunta: «qué nos dijimos».
// La actividad se sigue registrando igual; simplemente no se pinta aquí.
//
// Solo aparece en espacios COMPARTIDOS (ver BoardShell/page.tsx): en el
// personal no hay con quién conversar ni a quién mencionar.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { getProjectThread, addProjectComment, type ProjectThreadResult } from "./project-thread-actions";
import { createReminder, pinCommentToLogbook, toggleReaction, type PinType } from "./thread-actions";
import {
  summarizeReactions,
  toggleIntent,
  REACTION_PALETTE,
  type ReactionLike
} from "@/lib/domain/execution/reactions.ts";
import { PRESET_LABEL, type ReminderPreset } from "@/lib/domain/execution/reminders.ts";
import MenuSurface from "@/components/MenuSurface";
import { CommentBody, MentionComposer } from "./mention-ui";
import { useThreadRealtime } from "@/lib/hooks/useThreadRealtime";

const PRESETS: ReminderPreset[] = ["manana", "en-3-dias", "proxima-semana"];

export default function ProjectThreadPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectThreadResult | null>(null);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);

  const load = useCallback(() => {
    getProjectThread(projectId)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo cargar el hilo."));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Lo que escriba un compañero aparece sin recargar, por el MISMO camino que
  // una acción propia: una sola manera de refrescar.
  useThreadRealtime(projectId, load);

  // Sin eventos que intercalar no hay nada que mezclar: la consulta ya los pide
  // `order("created_at", { ascending: true })`, que es como se lee un chat.
  const entries = data?.comments ?? [];

  const reactionRows: ReactionLike[] = useMemo(
    () => (data ?? { reactions: [] }).reactions.map((r) => ({ commentId: r.comment_id, userId: r.user_id, emoji: r.emoji })),
    [data]
  );

  function closeMenu() {
    setOpenFor(null);
    setActionAnchor(null);
  }

  function react(commentId: string, emoji: string) {
    if (!data) return;
    const intent = toggleIntent(reactionRows, commentId, data.viewerId, emoji);
    startTransition(async () => {
      // Aquí el ✅ es una reacción y nada más. En el hilo de una TAREA además
      // la completa (reactDone); sobre un proyecto no hay tarea que cerrar, y
      // cerrar el proyecto entero con un emoji sería otra cosa muy distinta.
      const result = await toggleReaction(commentId, emoji, intent);
      setError(result.ok ? null : (result.reason ?? "No se pudo reaccionar."));
      load();
    });
  }

  function pin(commentId: string, type: PinType) {
    closeMenu();
    startTransition(async () => {
      const result = await pinCommentToLogbook(commentId, type);
      setError(result.ok ? null : (result.reason ?? "No se pudo fijar."));
    });
  }

  function remind(commentId: string, preset: ReminderPreset) {
    closeMenu();
    startTransition(async () => {
      const result = await createReminder("comment", commentId, preset, "");
      setError(result.ok ? null : (result.reason ?? "No se pudo crear el recordatorio."));
    });
  }

  function send() {
    startTransition(async () => {
      try {
        await addProjectComment(projectId, body);
        setBody("");
        setError(null);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje.");
      }
    });
  }

  if (!data) {
    return (
      <div className="card" style={{ background: "var(--surface)" }}>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          {error ?? "Cargando hilo…"}
        </span>
      </div>
    );
  }

  return (
    <div className="card" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <b className="text-sm">Hilo del proyecto</b>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {data.roster.length === 1
            ? "1 persona en este espacio"
            : `${data.roster.length} personas en este espacio`}
        </span>
      </div>

      {!entries.length && (
        <div className="text-xs" style={{ color: "var(--muted)", margin: "6px 0" }}>
          Nadie ha escrito todavía. Usa @ para mencionar a alguien del espacio; le llegará a su campana.
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        {entries.map((e) => (
          <div
            key={e.id}
            style={{ background: "var(--surface2)", borderRadius: 12, padding: "9px 11px", margin: "8px 0" }}
          >
            <div className="text-sm">
              <CommentBody body={e.body} roster={data.roster} />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6 }}>
              {summarizeReactions(reactionRows, e.id, data.viewerId).map((rx) => (
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
                  const abierto = openFor === e.id;
                  setOpenFor(abierto ? null : e.id);
                  setActionAnchor(abierto ? null : ev.currentTarget);
                }}
                aria-label="Reaccionar, fijar o recordar"
              >
                ⋯
              </button>
            </div>

            <div className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
              {e.authorName} · {new Date(e.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <MentionComposer
        roster={data.roster}
        value={body}
        onChange={setBody}
        onSend={send}
        pending={pending}
        placeholder="Escribe al equipo, usa @ para mencionar…"
      />

      {openFor && actionAnchor && (
        <MenuSurface
          anchor={actionAnchor}
          align="start"
          width={228}
          label="Acciones sobre el mensaje"
          onClose={closeMenu}
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
                  closeMenu();
                  react(id, emoji);
                }}
                aria-label={`Reaccionar con ${emoji}`}
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
