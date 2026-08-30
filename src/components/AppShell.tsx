"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { NAV_ITEMS } from "./nav-items";
import CommandPalette from "./CommandPalette";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

function TitleFromPath() {
  const pathname = usePathname();
  const item = NAV_ITEMS.find((n) => n.href === pathname);
  return <>{item?.label ?? "Life OS"}</>;
}

export default function AppShell({
  userName,
  bell,
  workspaceId,
  children
}: {
  userName: string;
  bell?: React.ReactNode;
  /** Espacio donde busca la paleta. Null si la cuenta no tiene ninguno. */
  workspaceId?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cierra el drawer móvil automáticamente al navegar (mejora la experiencia
  // táctil: evita que el menú quede abierto tapando la nueva vista).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="grid md:grid-cols-[272px_1fr] min-h-dvh">
      {/* Aquí y no en cada pantalla: Cmd+K tiene que responder desde todas, y
          este es el único ancestro que las envuelve a todas. */}
      <CommandPalette workspaceId={workspaceId ?? null} />
      <Sidebar open={open} onClose={() => setOpen(false)} />
      {open && (
        <div
          className="fixed inset-0 md:hidden"
          style={{ zIndex: "calc(var(--z-nav) - 1)", background: "rgba(15,15,35,.45)", backdropFilter: "blur(2px)" }}
          onClick={() => setOpen(false)}
        />
      )}
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
        {/* Ejecución llegó a tener 1600px porque a su tablero de 5 columnas
            había que sumarle el navegador de proyectos a la izquierda. Ese
            navegador ya no existe —la cartera es la propia lista de filas—, y
            sin él las filas se estiraban a lo ancho de la pantalla: 1600px
            para 884px de columnas dejaba el título de la tarea con 700px
            muertos. Todos los módulos comparten ahora la misma medida. */}
        <div
          className="p-3.5 sm:p-4 md:p-6 w-full mx-auto max-w-[1240px]"
          style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
