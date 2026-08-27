"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { NAV_ITEMS } from "./nav-items";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

function TitleFromPath() {
  const pathname = usePathname();
  const item = NAV_ITEMS.find((n) => n.href === pathname);
  return <>{item?.label ?? "Life OS"}</>;
}

export default function AppShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wide = pathname.startsWith("/execution");

  // Cierra el drawer móvil automáticamente al navegar (mejora la experiencia
  // táctil: evita que el menú quede abierto tapando la nueva vista).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="grid md:grid-cols-[272px_1fr] min-h-dvh">
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
          onMenuClick={() => setOpen(true)}
        />
        {/* El tablero de Ejecución es una rejilla de 5 columnas más el
            navegador de proyectos: a 1240px las columnas de estado, prioridad
            y fechas se quedaban sin ancho y el título se reducía a dos
            palabras. El resto de módulos sí quiere la medida de lectura. */}
        <div
          className={`p-3.5 sm:p-4 md:p-6 w-full mx-auto ${wide ? "max-w-[1600px]" : "max-w-[1240px]"}`}
          style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
