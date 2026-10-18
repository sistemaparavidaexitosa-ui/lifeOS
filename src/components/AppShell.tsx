"use client";

import { useEffect, useState } from "react";
import Topbar from "./Topbar";
import { NAV_ITEMS } from "./nav-items";
import CommandPalette from "./CommandPalette";
import BottomNav from "./nav/BottomNav";
import PestanasDeSeccion from "./nav/PestanasDeSeccion";
import MenuConfiguracion from "./nav/MenuConfiguracion";
import { usePathname } from "next/navigation";
import { registrarVisita } from "@/lib/comando/visitas";
import { Suspense } from "react";

function TitleFromPath() {
  const pathname = usePathname() ?? "";
  // La entrada exacta o, en una subruta (/investments/abc), la de su prefijo más largo.
  const item =
    NAV_ITEMS.find((n) => n.href === pathname) ??
    [...NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((n) => pathname.startsWith(`${n.href}/`));
  return <>{item?.label ?? "Life OS"}</>;
}

export default function AppShell({
  userName,
  bell,
  workspaceId,
  chatCollapsed = false,
  children
}: {
  userName: string;
  bell?: React.ReactNode;
  /** Espacio donde buscan la paleta y el chat. Null si la cuenta no tiene ninguno. */
  workspaceId?: string | null;
  /** La preferencia de plegado del rail, ya leída de la cookie por el layout. */
  chatCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cierra el drawer móvil automáticamente al navegar (mejora la experiencia
  // táctil: evita que el menú quede abierto tapando la nueva vista).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // POR DÓNDE PASAS, para aprender tu ritmo (D-183). Se apunta aquí y no en
  // cada página porque `AppShell` es el único ancestro de todas —el mismo
  // motivo por el que viven aquí la paleta y el chat—. `registrarVisita` nunca
  // lanza y no se espera: una visita sin apuntar es peor estadística, no un
  // fallo, y bloquear una navegación por contabilidad sería absurdo.
  useEffect(() => {
    if (!pathname) return;
    void registrarVisita(pathname + window.location.search);
  }, [pathname]);

  // Escape cierra el menú, sin animación de por medio (acción de teclado).
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  // Rediseño: una sola columna. Las secciones viven en la barra inferior, sus
  // subpantallas en las pestañas de arriba y el menú lateral solo guarda
  // Configuración. El rail del chat (AiChatRail) sale de la interfaz; su
  // backend sigue, para reciclarlo.
  //
  // `chatCollapsed` se acepta y se ignora: el layout lo sigue mandando y
  // quitarlo de allí no es parte de este cambio.
  void chatCollapsed;
  return (
    <div className="min-h-dvh">
      {/* Aquí y no en cada pantalla: Cmd+K tiene que responder desde todas, y
          este es el único ancestro que las envuelve a todas. */}
      <CommandPalette workspaceId={workspaceId ?? null} />
      <MenuConfiguracion abierto={open} onCerrar={() => setOpen(false)} userName={userName} />
      <main className="min-w-0 flex flex-col">
        <Topbar
          title={
            <Suspense fallback="Life OS">
              <TitleFromPath />
            </Suspense>
          }
          userName={userName}
          bell={bell}
          onMenuClick={() => setOpen(true)}
        />
        <Suspense fallback={null}>
          <PestanasDeSeccion />
        </Suspense>
        <div className="nx-contenido p-4 md:p-6 w-full mx-auto max-w-[1240px]">{children}</div>
      </main>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
