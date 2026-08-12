"use client";

import { signOut } from "@/app/(auth)/login/actions";

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
      className="sticky top-0 z-20 flex items-center gap-3 backdrop-blur"
      style={{
        padding: "14px 22px",
        paddingTop: "calc(14px + env(safe-area-inset-top))", // F12: barra superior fija con safe-area
        background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        borderBottom: "1px solid var(--line)"
      }}
    >
      <button className="btn-ghost md:hidden" style={{ minHeight: 40 }} onClick={onMenuClick} aria-label="Abrir menú">
        ☰
      </button>
      <h1 className="text-xl font-bold" style={{ letterSpacing: "-0.02em" }} suppressHydrationWarning>
        {title}
      </h1>
      <div className="flex-1" />
      <span className="chip accent">{userName.split(" ")[0]}</span>
      <form action={signOut}>
        <button className="btn-ghost btn-sm" type="submit">
          Salir
        </button>
      </form>
    </div>
  );
}
