"use client";

import { useState } from "react";
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

  return (
    <div className="grid md:grid-cols-[248px_1fr] min-h-dvh">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      {open && (
        <div
          className="fixed inset-0 z-[55] md:hidden"
          style={{ background: "rgba(0,0,0,.4)" }}
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
        <div className="p-4 md:p-6 max-w-[1180px] w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}
