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
          className="fixed inset-0 z-[55] md:hidden"
          style={{ background: "rgba(15,15,35,.45)", backdropFilter: "blur(2px)" }}
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
        <div className="p-3.5 sm:p-4 md:p-6 max-w-[1240px] w-full mx-auto" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
