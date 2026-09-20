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
//
// QUÉ QUEDÓ AQUÍ DESPUÉS DE D-176
// Solo el envase: el plegado, la cookie, la hoja de móvil y las tres formas de
// presentarse. El estado y la conversación se fueron a `chat/useAiChat.ts` y
// `chat/Conversacion.tsx` para que el centro de mando comparta historial en vez
// de abrir un segundo chat que se desincronizaría al primer mensaje. Ninguna
// conducta cambió al mudarse.

import { useCallback, useState } from "react";
import { useAiChat } from "./chat/useAiChat";
import Conversacion from "./chat/Conversacion";
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

const VACIO = (
  <div className="text-xs" style={{ color: "var(--muted)" }}>
    Pregúntame sobre tu semana, tus metas, tu dinero, tu agenda, tu tablero o lo que has comido. Veo todos tus módulos y
    también puedo buscar en internet. Dos veces al día te escribo yo, sin que preguntes; eso y qué módulos ve se ajustan
    en Configuración.
  </div>
);

export default function AiChatRail({
  workspaceId,
  initialCollapsed
}: {
  workspaceId: string | null;
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [sheetOpen, setSheetOpen] = useState(false);

  // `?chat=1` es a donde lleva el aviso del coach. Sin esto, tocar la
  // notificación en el teléfono abre Home con el rail plegado y el mensaje que
  // acaba de sonar no se ve por ninguna parte.
  const chat = useAiChat(workspaceId, () => {
    setCollapsed(false);
    setSheetOpen(true);
  });

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
          <Conversacion chat={chat} vacio={VACIO} />
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
            <Conversacion chat={chat} vacio={VACIO} />
          </aside>
        </>
      )}
    </>
  );
}
