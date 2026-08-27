"use client";

import { signOut } from "@/app/(auth)/login/actions";
import { IconMenu, IconLogout } from "./icons";
import { Avatar } from "./ui";

export default function Topbar({
  title,
  userName,
  onMenuClick
}: {
  title: React.ReactNode;
  userName: string;
  onMenuClick: () => void;
}) {
  return (
    <div
      className="sticky top-0 flex items-center gap-2.5 backdrop-blur"
      style={{
        // Escala de capas en globals.css: el chrome de la app manda sobre el
        // contenido. Antes valía z-20 y la barra del tablero (z-30) se le subía
        // encima al hacer scroll.
        zIndex: "var(--z-topbar)",
        padding: "10px 14px",
        paddingTop: "calc(10px + env(safe-area-inset-top))", // F12: barra superior fija con safe-area
        background: "color-mix(in srgb, var(--bg) 85%, transparent)",
        borderBottom: "1px solid var(--line)",
        minHeight: "var(--topbar-h)"
      }}
    >
      <button
        className="btn-ghost md:hidden"
        style={{ minHeight: 42, minWidth: 42, padding: 0 }}
        onClick={onMenuClick}
        aria-label="Abrir menú"
      >
        <IconMenu width={20} height={20} />
      </button>
      <h1 className="text-lg sm:text-xl font-bold truncate" style={{ letterSpacing: "-0.02em" }} suppressHydrationWarning>
        {title}
      </h1>
      <div className="flex-1" />
      <span className="hidden sm:inline-flex">
        <Avatar name={userName} size={30} />
      </span>
      <span className="text-sm font-bold hidden sm:inline">{userName.split(" ")[0]}</span>
      <form action={signOut}>
        <button className="btn-ghost btn-sm" type="submit" aria-label="Salir">
          <IconLogout width={16} height={16} />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </form>
    </div>
  );
}
