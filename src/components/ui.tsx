// Componentes UI puros (Server Components-friendly, sin "use client") —
// traducidos de las clases .card/.chip/.stat/.progress de LifeOS 4.html.
import type { ReactNode } from "react";

export function Card({ children, className = "", hero = false }: { children: ReactNode; className?: string; hero?: boolean }) {
  return (
    <div
      className={`card ${className}`}
      style={
        hero
          ? { background: "linear-gradient(145deg, var(--accent-d), var(--accent))", color: "#fff", border: 0, position: "relative", overflow: "hidden" }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function Chip({ children, kind = "" }: { children: ReactNode; kind?: "ok" | "warn" | "bad" | "info" | "accent" | "purple" | "" }) {
  return <span className={`chip ${kind}`}>{children}</span>;
}

export function Stat({ label, value, kind }: { label: string; value: ReactNode; kind?: "bad" | "warn" }) {
  return (
    <div className="card" style={{ padding: 15, borderRadius: 16 }}>
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <b
        className="block text-xl"
        style={{ letterSpacing: "-0.02em", color: kind === "bad" ? "var(--danger)" : kind === "warn" ? "var(--warn)" : undefined }}
      >
        {value}
      </b>
    </div>
  );
}

export function Progress({ pct, kind }: { pct: number; kind?: "warn" | "bad" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={`progress ${kind ?? ""}`}>
      <i style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-6" style={{ color: "var(--muted)" }}>
      <div className="text-3xl mb-1.5">{icon}</div>
      {text}
    </div>
  );
}
