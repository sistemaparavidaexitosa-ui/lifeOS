"use client";
// La bandeja: campana con contador y lista desplegable.
//
// Vive en la barra superior y no en el menú lateral porque no es una sección:
// es un aviso, y un aviso tiene que estar a la vista desde cualquier pantalla.
//
// La superficie es MenuSurface, la misma que usan los popovers del tablero, así
// que hereda el volteo arriba/abajo y el recorte contra los bordes sin repetir
// una línea de posicionamiento.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MenuSurface from "./MenuSurface";
import { IconBell } from "./icons";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";
import { useNotificationsRealtime } from "@/lib/hooks/useNotificationsRealtime";
import type { NotificationRow } from "@/lib/data/notifications";

/**
 * Qué es cada aviso, de un vistazo. La campana mezcla cuatro cosas muy
 * distintas —alguien te habló, alguien te dio trabajo, tú te lo apuntaste, se
 * te acaba el tiempo— y sin distinguirlas la lista se lee como un montón.
 */
const ETIQUETA: Record<NotificationRow["kind"], string> = {
  mention: "Mención",
  "task.assigned": "Asignada",
  reminder: "Recordatorio",
  "task.due": "Vencimiento"
};

export default function NotificationsMenu({ notifications }: { notifications: NotificationRow[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Sin esto la insignia se queda congelada mientras no navegues: te llega el
  // aviso al teléfono y la pestaña que tienes delante sigue diciendo cero.
  useNotificationsRealtime(() => router.refresh());

  function open(n: NotificationRow) {
    setAnchor(null);
    // Marcar y navegar en la misma transición: abrir el aviso ES haberlo
    // leído, y pedir un segundo gesto para confirmarlo sobra.
    startTransition(async () => {
      await markNotificationRead(n.id, n.commentId);
      // La URL la arma quien crea el aviso: sabe si fue en una tarea o en el
      // hilo de un proyecto, y aquí no hay por qué volver a decidirlo.
      router.push(n.href);
    });
  }

  return (
    <>
      <button
        className="btn-ghost"
        style={{ minHeight: 38, minWidth: 38, padding: 0, position: "relative" }}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        aria-label={
          notifications.length === 0
            ? "Sin avisos sin leer"
            : notifications.length === 1
              ? "1 aviso sin leer"
              : `${notifications.length} avisos sin leer`
        }
      >
        <IconBell width={18} height={18} />
        {notifications.length > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 4,
              right: 3,
              minWidth: 15,
              height: 15,
              padding: "0 3px",
              borderRadius: 999,
              background: "var(--danger)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: "15px",
              textAlign: "center"
            }}
          >
            {notifications.length > 9 ? "9+" : notifications.length}
          </span>
        )}
      </button>

      {anchor && (
        <MenuSurface anchor={anchor} align="end" width={300} label="Avisos" onClose={() => setAnchor(null)}>
          {!notifications.length ? (
            <div className="text-xs" style={{ color: "var(--muted)", padding: "10px 12px" }}>
              No hay nada pendiente. Aquí aparecerán las menciones, las tareas que te asignen, tus recordatorios y
              lo que esté por vencer.
            </div>
          ) : (
            <>
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className="ex-menu-item"
                  style={{ display: "block", textAlign: "left", whiteSpace: "normal" }}
                  disabled={pending}
                  onClick={() => open(n)}
                >
                  <span className="text-xs block" style={{ color: "var(--muted)" }}>
                    {ETIQUETA[n.kind]}
                  </span>
                  <b className="text-sm block truncate">{n.title}</b>
                  {n.body && (
                    <span className="text-xs block" style={{ color: "var(--muted)" }}>
                      {n.body.length > 70 ? `${n.body.slice(0, 70)}…` : n.body}
                    </span>
                  )}
                </button>
              ))}
              <button
                className="ex-menu-item"
                disabled={pending}
                onClick={() => {
                  setAnchor(null);
                  startTransition(() =>
                    markAllNotificationsRead(
                      notifications.map((n) => n.id),
                      notifications.map((n) => n.commentId).filter((id): id is string => Boolean(id))
                    )
                  );
                }}
              >
                Marcar todos como leídos
              </button>
            </>
          )}
        </MenuSurface>
      )}
    </>
  );
}
