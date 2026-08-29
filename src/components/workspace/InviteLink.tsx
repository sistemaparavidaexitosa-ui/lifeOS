"use client";

import { useState } from "react";

/**
 * Enlace de invitación con botón de copiar.
 *
 * Vive aparte del formulario a propósito: el enlace tiene que poder mostrarse
 * TAMBIÉN desde la lista de invitaciones pendientes, que se renderiza en el
 * servidor a partir de la base. El recuadro que aparece justo después de
 * invitar es una comodidad; la lista es la fuente de verdad.
 */
export default function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles (http, Safari sin gesto): el enlace ya
      // está visible y seleccionable en pantalla.
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <code
        className="text-xs"
        style={{ wordBreak: "break-all", background: "var(--surface2)", padding: "6px 8px", borderRadius: 8, flex: 1, minWidth: 200 }}
      >
        {url}
      </code>
      <button type="button" className="btn-ghost btn-sm" onClick={() => void copy()}>
        {copied ? "✓ Copiado" : "Copiar enlace"}
      </button>
    </div>
  );
}
