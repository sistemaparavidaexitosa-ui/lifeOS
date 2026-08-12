"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { NAV_ITEMS } from "./nav-items";

// F7 🔴: usePathname también se envuelve en Suspense por precaución explícita
// del guardrail del prompt de build, aunque solo useSearchParams provoca el
// bailout de prerender documentado por Next.js.
export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Suspense fallback={<aside className="side" />}>
      <SidebarInner open={open} onClose={onClose} />
    </Suspense>
  );
}

function SidebarInner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  let lastGroup = "";

  return (
    <aside
      className={`side fixed md:sticky top-0 left-0 h-dvh md:h-screen overflow-auto z-[60] md:z-auto transition-transform ${
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}
      style={{
        width: 270,
        background: "var(--surface)",
        borderRight: "1px solid var(--line)",
        padding: "18px 14px",
        paddingTop: "calc(18px + env(safe-area-inset-top))"
      }}
    >
      <div className="flex items-center gap-2 pb-3">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center text-white font-black"
          style={{ background: "linear-gradient(145deg, var(--accent), var(--accent2))" }}
        >
          L
        </div>
        <div>
          <div className="font-black tracking-tight">Life OS</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Ejecución · Dinero · Patrimonio
          </div>
        </div>
      </div>
      {NAV_ITEMS.map((item) => {
        const showGroup = item.group !== lastGroup;
        lastGroup = item.group;
        const active = pathname === item.href;
        return (
          <div key={item.href}>
            {showGroup && (
              <div className="text-[11px] uppercase tracking-wider font-extrabold mt-3 mb-1 px-2" style={{ color: "var(--muted)" }}>
                {item.group}
              </div>
            )}
            <Link
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-2 w-full rounded-xl px-2.5 py-2 font-semibold"
              style={{
                background: active ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
                color: active ? "var(--accent-d)" : "var(--text)"
              }}
            >
              {item.label}
            </Link>
          </div>
        );
      })}
    </aside>
  );
}
