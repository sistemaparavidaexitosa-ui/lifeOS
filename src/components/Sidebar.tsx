"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { NAV_ITEMS } from "./nav-items";
import { NAV_ICONS } from "./icons";

// F7 🔴: usePathname también se envuelve en Suspense por precaución explícita
// del guardrail del prompt de build, aunque solo useSearchParams provoca el
// bailout de prerender documentado por Next.js.
//
// Rediseño Monday-style: cada NAV_ITEM ahora trae ícono (NAV_ICONS) y color
// de acento (item.color) — la fila activa muestra una barra de color a la
// izquierda + fondo tintado (.side-link.active en globals.css), igual que
// el resaltado de sección en la sidebar de monday.com. En móvil, la sidebar
// es un drawer de ancho completo con backdrop e íconos grandes (mejora la
// experiencia táctil reportada como deficiente).
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
      className={`fixed md:sticky top-0 left-0 h-dvh md:h-screen overflow-y-auto overflow-x-hidden ex-nav-layer md:z-auto transition-transform duration-200 ${
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}
      style={{
        width: 272,
        maxWidth: "84vw",
        background: "var(--surface)",
        borderRight: "1px solid var(--line)",
        padding: "16px 12px",
        paddingTop: "calc(16px + env(safe-area-inset-top))",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))"
      }}
    >
      <div className="flex items-center gap-2.5 pb-4 px-1">
        <div
          className="w-10 h-10 rounded-2xl grid place-items-center text-white font-black text-lg flex-shrink-0"
          style={{ background: "linear-gradient(145deg, var(--accent), var(--c-teal))", boxShadow: "0 6px 16px color-mix(in srgb, var(--accent) 45%, transparent)" }}
        >
          L
        </div>
        <div className="min-w-0">
          <div className="font-black tracking-tight" style={{ letterSpacing: "-0.01em" }}>
            Life OS
          </div>
          <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
            Ejecución · Dinero · Patrimonio
          </div>
        </div>
        <button className="md:hidden ml-auto btn-ghost btn-sm" style={{ minHeight: 36, padding: "6px 10px" }} onClick={onClose} aria-label="Cerrar menú">
          ✕
        </button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.filter((item) => !item.hidden).map((item) => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          const active = pathname === item.href;
          const Icon = NAV_ICONS[item.icon];
          return (
            <div key={item.href}>
              {showGroup && (
                <div className="text-[11px] uppercase tracking-wider font-extrabold mt-3.5 mb-1 px-2.5" style={{ color: "var(--muted)" }}>
                  {item.group}
                </div>
              )}
              <Link
                href={item.href}
                onClick={onClose}
                className={`side-link${active ? " active" : ""}`}
                style={{ "--item-color": item.color } as React.CSSProperties}
              >
                <span className="side-icon">
                  <Icon width={18} height={18} />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
