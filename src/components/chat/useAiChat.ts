"use client";
// src/components/chat/useAiChat.ts
// El chat de IA, sin su envase (D-176).
//
// POR QUÉ SE EXTRAJO
// Todo esto vivía dentro de `AiChatRail`, que ya renderizaba su conversación
// DOS VECES —la columna de escritorio y la hoja de móvil— con una constante
// JSX. Al llevar el chat también al centro de mando habrían sido tres, y la
// tercera con su propia copia del estado: dos historiales que se
// desincronizarían en cuanto alguien escribiera en uno.
//
// Aquí está el estado y las acciones; el JSX, en `Conversacion.tsx`. Lo que NO
// entra es el plegado ni la hoja: eso es del rail y solo del rail.
//
// NADA DE ESTO CAMBIÓ DE CONDUCTA al mudarse. El turno propio se sigue pintando
// optimista, los fallos de `loadPendingProposals` se siguen tragando en
// silencio, y `acceptProposal` sigue retirando la tarjeta cuando la propuesta
// quedó `fallida`.

import { useEffect, useRef, useState, useTransition } from "react";
import {
  loadChatHistory,
  sendChatMessage,
  createTaskFromChat,
  createMemoryFromChat,
  type ChatMessage
} from "@/lib/ai-chat/actions";
import { loadPendingProposals, acceptProposal, dismissProposal, type CoachProposalRow } from "@/lib/coach/actions";

export interface AiChat {
  messages: ChatMessage[];
  draft: string;
  setDraft: (v: string) => void;
  pending: boolean;
  error: string | null;
  /** La tarea que propone el chat en ESTE turno. Se pierde al recargar. */
  proposal: string | null;
  created: boolean;
  memoria: { text: string; scope: string } | null;
  recordado: boolean;
  /** Aviso de respuesta degradada (reintento sin herramientas). */
  nota: string | null;
  /** Lo que el coach dejó propuesto mientras nadie miraba. Vive en la base. */
  propuestas: CoachProposalRow[];
  bodyRef: React.RefObject<HTMLDivElement | null>;
  workspaceId: string | null;
  send: () => void;
  crearTarea: () => void;
  descartarTarea: () => void;
  aceptarPropuesta: (p: CoachProposalRow) => void;
  descartarPropuesta: (p: CoachProposalRow) => void;
  recordar: () => void;
  descartarMemoria: () => void;
}

export function useAiChat(
  workspaceId: string | null,
  /**
   * Qué hacer cuando la URL trae `?chat=1`, que es a donde lleva el aviso del
   * coach. El rail lo usa para desplegarse; el centro, para no hacer nada —ahí
   * el chat ya está a la vista—.
   */
  alPedirseAbrir?: () => void
): AiChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [memoria, setMemoria] = useState<{ text: string; scope: string } | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [recordado, setRecordado] = useState(false);
  const [propuestas, setPropuestas] = useState<CoachProposalRow[]>([]);
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // `alPedirseAbrir` en una ref: si entrara en las dependencias del efecto, una
  // función recreada en cada render volvería a cargar el historial entero.
  const abrir = useRef(alPedirseAbrir);
  abrir.current = alPedirseAbrir;

  useEffect(() => {
    loadChatHistory()
      .then(setMessages)
      .catch(() => setError("No se pudo cargar la conversación."));
    // Si esto falla no se dice nada: son botones de más sobre una conversación
    // que se lee igual sin ellos. Un error rojo por no poder pintar un botón
    // opcional es peor que el botón que falta.
    loadPendingProposals()
      .then(setPropuestas)
      .catch(() => undefined);

    try {
      if (new URLSearchParams(window.location.search).get("chat") === "1") abrir.current?.();
    } catch {
      // Un parámetro ilegible no es motivo para no cargar el chat.
    }
  }, []);

  // El último mensaje es el que uno viene a ver.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  function send() {
    const texto = draft.trim();
    if (!texto || pending) return;

    // El turno propio se pinta ANTES de que conteste el modelo. La respuesta
    // tarda segundos y ver tu propia frase desaparecer de la caja sin aparecer
    // arriba se lee como que se perdió.
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
    setNota(null);

    startTransition(async () => {
      const result = await sendChatMessage(texto);
      if (!result.ok || !result.reply) {
        setError(result.reason ?? "No se pudo responder.");
        return;
      }
      setMessages((prev) => [...prev, result.reply!]);
      setProposal(result.proposedTask ?? null);
      setMemoria(result.proposedMemory ?? null);
      setNota(result.nota ?? null);
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

  function aceptarPropuesta(p: CoachProposalRow) {
    startTransition(async () => {
      const result = await acceptProposal(p.id, workspaceId);
      if (!result.ok) {
        setError(result.reason ?? "No se pudo crear.");
        // `resuelta` significa que la propuesta ya quedó `fallida` en la base
        // (la frontera o un nodo que ya no se ve, ver `graph_aceptar_arista`):
        // la tarjeta se retira igual que si se hubiera aceptado, porque un
        // segundo clic solo puede volver a fallar por lo mismo.
        if (result.resuelta) setPropuestas((prev) => prev.filter((x) => x.id !== p.id));
        return;
      }
      setPropuestas((prev) => prev.filter((x) => x.id !== p.id));
      // `estructura` no crea nada: lleva al proyecto, donde el plan se revisa
      // antes de aplicarse. Ver `ejecutar()` en lib/coach/actions.ts.
      if (result.href) window.location.href = result.href;
    });
  }

  function descartarPropuesta(p: CoachProposalRow) {
    startTransition(async () => {
      await dismissProposal(p.id);
      setPropuestas((prev) => prev.filter((x) => x.id !== p.id));
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

  return {
    messages,
    draft,
    setDraft,
    pending,
    error,
    proposal,
    created,
    memoria,
    recordado,
    nota,
    propuestas,
    bodyRef,
    workspaceId,
    send,
    crearTarea,
    descartarTarea: () => setProposal(null),
    aceptarPropuesta,
    descartarPropuesta,
    recordar,
    descartarMemoria: () => setMemoria(null)
  };
}
