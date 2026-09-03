"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { NAV_ITEMS } from "./nav-items";
import CommandPalette from "./CommandPalette";
import AiChatRail from "./AiChatRail";
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

  return (
    // Tres columnas a partir de xl (1280px), que es donde el rail del chat
    // cabe sin estrangular el contenido. `auto` y no un ancho fijo porque el
    // rail se pliega a una franja y es él quien decide cuál de las dos formas
    // pinta; el grid solo le hace sitio.
    <div className="grid md:grid-cols-[272px_1fr] xl:grid-cols-[272px_1fr_auto] min-h-dvh">
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

      {/* Tercera celda del grid, hermana de <main> y no hija: si colgara de
          dentro heredaría el max-w del contenido y el scroll de la página, y
          la conversación arrastraría el tablero al bajar. */}
      <AiChatRail workspaceId={workspaceId ?? null} initialCollapsed={chatCollapsed} />
    </div>
  );
}
