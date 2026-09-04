"use client";
// EL CHAT DE IA TRANSVERSAL.
//
// POR QUÉ UN RAIL Y NO UNA PANTALLA
// Casi todo lo que se le pregunta a este chat es SOBRE lo que se está mirando:
// «¿por cuál empiezo?» delante del tablero, «¿cuánto llevo?» delante del
// presupuesto. Mandar al usuario a /chat le quita justo el contexto que hace
// buena la pregunta. Por eso vive en el AppShell, al lado de CommandPalette y
// por el mismo motivo que aquélla: es el único ancestro de todas las pantallas.
//
// POR QUÉ SE PLIEGA Y NO SE CIERRA
// El tablero de /execution con sus cinco columnas es donde más estorba y donde
// más falta hace tenerlo a mano. Plegado deja una franja con el icono —el mismo
// botón que lo abre— en vez de desaparecer y obligar a buscarlo.
//
// Por debajo de 1280px no cabe: 272 de menú + contenido + 360 de rail
// estrangula la pantalla. Ahí se comporta como los demás paneles del proyecto,
// reusando .td-backdrop/.td-drawer, que en móvil ya suben desde abajo.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  loadChatHistory,
  sendChatMessage,
  createTaskFromChat,
  createMemoryFromChat,
  type ChatMessage
} from "@/lib/ai-chat/actions";
import { IconSparkles, IconClose, IconChevronRight } from "./icons";

/**
 * La preferencia de plegado va en una COOKIE y no en `localStorage`.
 *
 * No es indiferente: `localStorage` solo se puede leer después de hidratar, así
 * que el servidor pintaría siempre la misma forma y el rail entraría —o se
 * plegaría— un frame más tarde, moviendo el ancho del contenido en cada carga
 * de página. La cookie la lee el layout y llega ya decidida.
 *
 * Un año: es una preferencia de interfaz, no una sesión.
 */
const COOKIE = "lifeos_chat_collapsed";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export default function AiChatRail({
  workspaceId,
  initialCollapsed
}: {
  workspaceId: string | null;
  initialCollapsed: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [memoria, setMemoria] = useState<{ text: string; scope: string } | null>(null);
  const [recordado, setRecordado] = useState(false);
  const [pending, startTransition] = useTransition();

  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [sheetOpen, setSheetOpen] = useState(false);

  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadChatHistory()
      .then(setMessages)
      .catch(() => setError("No se pudo cargar la conversación."));
  }, []);

  // El último mensaje es el que uno viene a ver.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, sheetOpen, collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        document.cookie = `${COOKIE}=${next ? "1" : "0"}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
      } catch {
        // Que no se recuerde la preferencia no es motivo para no aplicarla.
      }
      return next;
    });
  }, []);

  function send() {
    const texto = draft.trim();
    if (!texto || pending) return;

    // El turno propio se pinta ANTES de que conteste el modelo. La respuesta
    // tarda segundos y ver tu propia frase desaparecer de la caja sin
    // aparecer arriba se lee como que se perdió.
    const optimista: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: texto,
      factIds: [],
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimista]);
    setDraft("");
    setError(null);
    setProposal(null);
    setCreated(false);
    setMemoria(null);
    setRecordado(false);

    startTransition(async () => {
      const result = await sendChatMessage(texto);
      if (!result.ok || !result.reply) {
        setError(result.reason ?? "No se pudo responder.");
        return;
      }
      setMessages((prev) => [...prev, result.reply!]);
      setProposal(result.proposedTask ?? null);
      setMemoria(result.proposedMemory ?? null);
    });
  }

  function crearTarea() {
    if (!proposal || !workspaceId) return;
    startTransition(async () => {
      const result = await createTaskFromChat(workspaceId, proposal);
      if (!result.ok) {
        setError(result.reason ?? "No se pudo crear la tarea.");
        return;
      }
      setCreated(true);
      setProposal(null);
    });
  }

  function recordar() {
    if (!memoria) return;
    startTransition(async () => {
      const result = await createMemoryFromChat(memoria.text, memoria.scope);
      if (!result.ok) {
        setError(result.reason ?? "No se pudo guardar.");
        return;
      }
      setRecordado(true);
      setMemoria(null);
    });
  }

  const conversacion = (
    <>
      <div className="ai-rail-body" ref={bodyRef}>
        {!messages.length && !pending && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Pregúntame sobre tu semana, tu dinero o tu tablero. Solo veo los dominios que hayas
            encendido en Configuración → IA.
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`ai-msg ${m.role === "user" ? "ai-msg-user" : "ai-msg-assistant"}`}>
            {m.content}
            {m.role === "assistant" && m.factIds.length > 0 && (
              <div className="text-xs" style={{ color: "var(--muted)", marginTop: 5 }}>
                {m.factIds.length === 1 ? "Basado en 1 hecho de tu cuenta" : `Basado en ${m.factIds.length} hechos de tu cuenta`}
              </div>
            )}
          </div>
        ))}

        {pending && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Pensando…
          </div>
        )}

        {proposal && (
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "9px 11px",
              background: "var(--surface2)"
            }}
          >
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Propongo esta tarea
            </div>
            <div className="text-sm" style={{ fontWeight: 700, margin: "3px 0 7px" }}>
              {proposal}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button className="btn-primary btn-sm" disabled={pending || !workspaceId} onClick={crearTarea}>
                Crear
              </button>
              <button className="btn-ghost btn-sm" disabled={pending} onClick={() => setProposal(null)}>
                Descartar
              </button>
            </div>
            {!workspaceId && (
              <div className="text-xs" style={{ color: "var(--muted)", marginTop: 5 }}>
                Necesitas un espacio con al menos un proyecto para poder crearla.
              </div>
            )}
          </div>
        )}

        {memoria && (
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "9px 11px",
              background: "var(--surface2)"
            }}
          >
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              ¿Lo recuerdo para siempre?
            </div>
            <div className="text-sm" style={{ fontWeight: 700, margin: "3px 0 7px" }}>
              {memoria.text}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button className="btn-primary btn-sm" disabled={pending} onClick={recordar}>
                Recordar
              </button>
              <button className="btn-ghost btn-sm" disabled={pending} onClick={() => setMemoria(null)}>
                Descartar
              </button>
            </div>
          </div>
        )}

        {created && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Tarea creada. La encuentras en Ejecución.
          </div>
        )}

        {recordado && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Guardado. Lo puedes editar o borrar en Inteligencia → Memoria.
          </div>
        )}

        {error && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}
      </div>

      <div className="ai-rail-composer">
        {/* Sin `className`: `globals.css` estiliza `input, select, textarea` por
            elemento, y este proyecto no tiene una clase `.input`. */}
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // Enter envía y Shift+Enter salta de línea, como en cualquier chat.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Pregunta lo que sea…"
          aria-label="Escribe tu mensaje"
          style={{ resize: "none", width: "100%" }}
        />
        <div className="flex justify-end" style={{ marginTop: 6 }}>
          <button className="btn-primary btn-sm" disabled={pending || !draft.trim()} onClick={send}>
            {pending ? "Pensando…" : "Enviar"}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ESCRITORIO — la tercera columna. */}
      {!collapsed && (
        <aside className="ai-rail" aria-label="Chat de IA">
          <div className="ai-rail-header">
            <IconSparkles width={16} height={16} />
            <b className="text-sm flex-1">Asistente</b>
            <button className="btn-ghost btn-sm" onClick={toggleCollapsed} aria-label="Plegar el chat">
              <IconChevronRight width={16} height={16} />
            </button>
          </div>
          {conversacion}
        </aside>
      )}

      {collapsed && (
        <div className="ai-rail-collapsed">
          <button className="btn-ghost btn-sm" onClick={toggleCollapsed} aria-label="Abrir el chat de IA">
            <IconSparkles width={18} height={18} />
          </button>
        </div>
      )}

      {/* MÓVIL Y TABLET — la burbuja y su hoja. */}
      <button className="ai-fab" onClick={() => setSheetOpen(true)} aria-label="Abrir el chat de IA">
        <IconSparkles width={20} height={20} />
      </button>

      {sheetOpen && (
        <>
          <div className="td-backdrop ai-chat-sheet-backdrop" onClick={() => setSheetOpen(false)} />
          <aside className="td-drawer ai-chat-sheet" role="dialog" aria-modal="true" aria-label="Chat de IA">
            <div className="td-drawer-header">
              <span className="td-drawer-title">Asistente</span>
              <button className="td-drawer-close" onClick={() => setSheetOpen(false)} aria-label="Cerrar">
                <IconClose width={16} height={16} />
              </button>
            </div>
            {conversacion}
          </aside>
        </>
      )}
    </>
  );
}
