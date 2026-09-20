"use client";
// src/components/chat/Conversacion.tsx
// La conversación, sin su envase (D-176).
//
// Se renderiza en tres sitios: la columna de escritorio del rail, su hoja de
// móvil y el centro de mando. Antes eran dos copias de la misma constante JSX
// dentro de `AiChatRail`; ahora es un componente, y el estado viene de
// `useAiChat` para que las tres compartan historial.
//
// Las burbujas reutilizan `.ai-msg`/`.ai-rail-body` de globals.css. Eso sí se
// pudo reutilizar; `.ai-rail` NO, porque lleva `width: 360px`, `position:
// sticky` y se oculta por debajo de 1280px — traerlo al centro habría hecho
// desaparecer el chat en el móvil, que es donde más se usa.

import { ProposalCard } from "@/components/ui";
import type { AiChat } from "./useAiChat";
import type { CoachProposalRow } from "@/lib/coach/actions";

/** Cómo se presenta cada tipo de propuesta. El espejo del `check` de la base. */
function encabezadoDe(tipo: string): string {
  if (tipo === "arista") return "Propongo conectar esto en tu mapa";
  if (tipo === "bloque") return "Propongo agendar esto";
  if (tipo === "rutina") return "Propongo esta rutina";
  if (tipo === "meta") return "Propongo esta meta";
  if (tipo === "estructura") return "Este proyecto necesita estructura";
  return "Propongo esta tarea";
}

function botonDe(tipo: string): string {
  if (tipo === "estructura") return "Ir al proyecto";
  if (tipo === "arista") return "Conectar";
  return "Crear";
}

export function PropuestaDelCoach({ p, chat }: { p: CoachProposalRow; chat: AiChat }) {
  return (
    <ProposalCard eyebrow={encabezadoDe(p.tipo)} title={p.titulo} detail={p.detalle || null}>
      <button
        className="btn-primary btn-sm"
        disabled={chat.pending || (p.tipo === "tarea" && !chat.workspaceId)}
        onClick={() => chat.aceptarPropuesta(p)}
      >
        {botonDe(p.tipo)}
      </button>
      <button className="btn-ghost btn-sm" disabled={chat.pending} onClick={() => chat.descartarPropuesta(p)}>
        Descartar
      </button>
      {p.tipo === "arista" && p.payload.source && (
        <a className="btn-ghost btn-sm" href={`/graph?entity=${p.payload.source}`}>
          Ver en el grafo
        </a>
      )}
    </ProposalCard>
  );
}

export default function Conversacion({
  chat,
  vacio,
  /** Las propuestas del coach ya se pintan arriba, en el mando: aquí estorban. */
  sinPropuestas = false
}: {
  chat: AiChat;
  vacio: React.ReactNode;
  sinPropuestas?: boolean;
}) {
  return (
    <>
      <div className="ai-rail-body" ref={chat.bodyRef}>
        {!chat.messages.length && !chat.pending && vacio}

        {chat.messages.map((m) => (
          <div key={m.id} className={`ai-msg ${m.role === "user" ? "ai-msg-user" : "ai-msg-assistant"}`}>
            {m.content}
            {m.role === "assistant" && m.factIds.length > 0 && (
              <div className="text-xs" style={{ color: "var(--muted)", marginTop: 5 }}>
                {m.factIds.length === 1
                  ? "Basado en 1 hecho de tu cuenta"
                  : `Basado en ${m.factIds.length} hechos de tu cuenta`}
              </div>
            )}
          </div>
        ))}

        {chat.pending && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Pensando…
          </div>
        )}

        {!sinPropuestas && chat.propuestas.map((p) => <PropuestaDelCoach key={p.id} p={p} chat={chat} />)}

        {chat.proposal && (
          <ProposalCard eyebrow="Propongo esta tarea" title={chat.proposal}>
            <button className="btn-primary btn-sm" disabled={chat.pending || !chat.workspaceId} onClick={chat.crearTarea}>
              Crear
            </button>
            <button className="btn-ghost btn-sm" disabled={chat.pending} onClick={chat.descartarTarea}>
              Descartar
            </button>
            {!chat.workspaceId && (
              <div className="text-xs" style={{ color: "var(--muted)", marginTop: 5, width: "100%" }}>
                Necesitas un espacio con al menos un proyecto para poder crearla.
              </div>
            )}
          </ProposalCard>
        )}

        {chat.memoria && (
          <ProposalCard eyebrow="¿Lo recuerdo para siempre?" title={chat.memoria.text}>
            <button className="btn-primary btn-sm" disabled={chat.pending} onClick={chat.recordar}>
              Recordar
            </button>
            <button className="btn-ghost btn-sm" disabled={chat.pending} onClick={chat.descartarMemoria}>
              Descartar
            </button>
          </ProposalCard>
        )}

        {chat.created && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Tarea creada. La encuentras en Ejecución.
          </div>
        )}

        {chat.recordado && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Guardado. Lo puedes editar o borrar en Inteligencia → Memoria.
          </div>
        )}

        {chat.nota && (
          <div className="text-xs" style={{ color: "var(--warn)" }}>
            {chat.nota}
          </div>
        )}

        {chat.error && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {chat.error}
          </div>
        )}
      </div>

      <div className="ai-rail-composer">
        {/* Sin `className`: `globals.css` estiliza `input, select, textarea` por
            elemento, y este proyecto no tiene una clase `.input`. */}
        <textarea
          rows={2}
          value={chat.draft}
          onChange={(e) => chat.setDraft(e.target.value)}
          // Enter envía y Shift+Enter salta de línea, como en cualquier chat.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              chat.send();
            }
          }}
          placeholder="Pregunta lo que sea…"
          aria-label="Escribe tu mensaje"
          style={{ resize: "none", width: "100%" }}
        />
        <div className="flex justify-end" style={{ marginTop: 6 }}>
          <button className="btn-primary btn-sm" disabled={chat.pending || !chat.draft.trim()} onClick={chat.send}>
            {chat.pending ? "Pensando…" : "Enviar"}
          </button>
        </div>
      </div>
    </>
  );
}
