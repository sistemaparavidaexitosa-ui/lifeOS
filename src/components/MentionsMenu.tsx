"use client";
// La bandeja de menciones: campana con contador y lista desplegable.
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
import { markAllMentionsRead, markMentionRead } from "@/lib/mentions/actions";
import type { MentionRow } from "@/lib/data/mentions";

export default function MentionsMenu({ mentions }: { mentions: MentionRow[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function open(mention: MentionRow) {
    setAnchor(null);
    // Marcar y navegar en la misma transición: abrir la mención ES haberla
    // leído, y pedir un segundo gesto para confirmarlo sobra.
    startTransition(async () => {
      await markMentionRead(mention.commentId);
      // La URL la arma quien carga la bandeja: sabe si la mención fue en una
      // tarea o en el hilo de un proyecto, y aquí no hay por qué volver a
      // decidirlo.
      router.push(mention.href);
    });
  }

  return (
    <>
      <button
        className="btn-ghost"
        style={{ minHeight: 38, minWidth: 38, padding: 0, position: "relative" }}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        aria-label={
          mentions.length === 0
            ? "Sin menciones sin leer"
            : mentions.length === 1
              ? "1 mención sin leer"
              : `${mentions.length} menciones sin leer`
        }
      >
        <IconBell width={18} height={18} />
        {mentions.length > 0 && (
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
            {mentions.length > 9 ? "9+" : mentions.length}
          </span>
        )}
      </button>

      {anchor && (
        <MenuSurface anchor={anchor} align="end" width={300} label="Menciones" onClose={() => setAnchor(null)}>
          {!mentions.length ? (
            <div className="text-xs" style={{ color: "var(--muted)", padding: "10px 12px" }}>
              Nadie te ha mencionado. Cuando alguien lo haga con @ en un comentario, aparecerá aquí.
            </div>
          ) : (
            <>
              {mentions.map((m) => (
                <button
                  key={m.commentId}
                  className="ex-menu-item"
                  style={{ display: "block", textAlign: "left", whiteSpace: "normal" }}
                  disabled={pending}
                  onClick={() => open(m)}
                >
                  <b className="text-sm block truncate">{m.subjectTitle}</b>
                  <span className="text-xs block" style={{ color: "var(--muted)" }}>
                    {m.authorName}: {m.body.length > 70 ? `${m.body.slice(0, 70)}…` : m.body}
                  </span>
                </button>
              ))}
              <button
                className="ex-menu-item"
                disabled={pending}
                onClick={() => {
                  setAnchor(null);
                  startTransition(() => markAllMentionsRead(mentions.map((m) => m.commentId)));
                }}
              >
                Marcar todas como leídas
              </button>
            </>
          )}
        </MenuSurface>
      )}
    </>
  );
}
