// Componentes UI puros (Server Components-friendly, sin "use client") —
// traducidos de las clases .card/.chip/.stat/.progress de LifeOS 4.html.
//
// Rediseño Monday-style: se agregan Avatar (burbuja de iniciales con color
// determinista por nombre, para la columna "Personas") y STATUS_META (mapa
// de color/etiqueta por TaskStatus, reutilizado por MondayBoard/StatusMenu).
// Todos los exports previos se conservan sin cambios de firma.
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

/** Paleta determinista para avatares/grupos — 8 tonos vivos estilo monday.com. */
const AVATAR_PALETTE = ["#6161ff", "#00c875", "#fdab3d", "#e2445c", "#579bfc", "#a25ddc", "#2dd4bf", "#ff5ac4"];

export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Burbuja de iniciales con color determinista — columna "Personas" del tablero. */
export function Avatar({ name, size = 26, title }: { name: string; size?: number; title?: string }) {
  return (
    <span
      className="mb-avatar"
      title={title ?? name}
      style={{ width: size, height: size, fontSize: size * 0.4, background: colorForName(name) }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  if (!names.length) {
    return (
      <span className="mb-avatar" style={{ background: "var(--st-notstarted)" }} title="Sin responsables">
        —
      </span>
    );
  }
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className="mb-avatars">
      {shown.map((n) => (
        <Avatar key={n} name={n} />
      ))}
      {extra > 0 && (
        <span className="mb-avatar" style={{ background: "var(--muted)" }}>
          +{extra}
        </span>
      )}
    </span>
  );
}
