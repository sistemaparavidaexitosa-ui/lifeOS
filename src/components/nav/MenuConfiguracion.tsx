"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import { IconLogout, IconNavSettings } from "../icons";
import { Avatar } from "../ui";

/**
 * El menú lateral del rediseño: SOLO Configuración. Las secciones viven en la
 * barra inferior y sus subpantallas en las pestañas de arriba.
 */
export default function MenuConfiguracion({ abierto, onCerrar, userName }: { abierto: boolean; onCerrar: () => void; userName: string }) {
  const ruta = usePathname() ?? "";
  if (!abierto) return null;
  return (
    <>
      <div className="nx-velo" onClick={onCerrar} aria-hidden="true" />
      <aside className="nx-menu" role="dialog" aria-modal="true" aria-label="Configuración">
        <div className="flex items-center gap-3 px-2 pb-4">
          <Avatar name={userName} size={36} />
          <div className="min-w-0">
            <div className="font-semibold truncate">{userName}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Life OS
            </div>
          </div>
        </div>
        <Link href="/settings" className="nx-menu-enlace" aria-current={ruta.startsWith("/settings") ? "page" : undefined} onClick={onCerrar}>
          <IconNavSettings width={20} height={20} />
          Configuración
        </Link>
        <div className="flex-1" />
        <form action={signOut}>
          <button type="submit" className="nx-menu-enlace w-full" style={{ border: 0, background: "transparent", cursor: "pointer", font: "inherit", color: "var(--muted)" }}>
            <IconLogout width={20} height={20} />
            Salir
          </button>
        </form>
      </aside>
    </>
  );
}
