// Iconos propios de Execution: trazo fino, monocromos salvo el estado.

import type { Priority, TaskStatus } from "@/lib/domain/types.ts";
import { STATUS_META } from "../status-meta";

/**
 * El estado como un círculo que se llena conforme avanza (Linear). Con
 * `recien`, el «Hecho» se dibuja: el relleno crece y la palomita se traza.
 * Solo al marcarla en esta sesión; una tarea que ya llegó hecha no se anima.
 */
export function IconoEstado({ estado, recien = false, size = 18 }: { estado: TaskStatus; recien?: boolean; size?: number }) {
  const color = STATUS_META[estado].color;
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    "aria-hidden": true as const,
    className: "xr-icono-estado",
    "data-recien": recien || undefined
  };
  switch (estado) {
    case "Pending":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      );
    case "InProgress":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={color} strokeWidth="1.5" />
          <path className="xr-media-luna" d="M8 4.2a3.8 3.8 0 0 1 0 7.6z" fill={color} />
        </svg>
      );
    case "Blocked":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="m4.4 11.6 7.2-7.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "Rescheduled":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2.2 2" />
        </svg>
      );
    case "Completed":
      return (
        <svg {...props}>
          <circle className="xr-relleno" cx="8" cy="8" r="7" fill={color} />
          <path
            className="xr-palomita"
            d="m5 8.3 2 2 4-4.3"
            fill="none"
            stroke="var(--bg)"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
          />
        </svg>
      );
    case "Cancelled":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="7" fill={color} />
          <path d="m5.6 5.6 4.8 4.8m0-4.8-4.8 4.8" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}

/** Prioridad como barras (1–3); urgente, un cuadro con «!». */
export function IconoPrioridad({ prioridad, urgente }: { prioridad: Priority; urgente: boolean }) {
  if (urgente) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-label="Urgente" role="img" className="xr-icono-prioridad">
        <rect width="14" height="14" rx="3.5" fill="var(--danger)" />
        <path d="M7 3.5v4.2M7 10v.3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  const n = prioridad === "High" ? 3 : prioridad === "Medium" ? 2 : 1;
  const nombre = prioridad === "High" ? "alta" : prioridad === "Medium" ? "media" : "baja";
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-label={`Prioridad ${nombre}`} role="img" className="xr-icono-prioridad">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1 + i * 4.5} y={9 - i * 3.5} width="3" height={4 + i * 3.5} rx="1" fill={i < n ? "currentColor" : "var(--surface3)"} />
      ))}
    </svg>
  );
}

/**
 * Anillo de avance. Se dibuja con `stroke-dashoffset` sobre `pathLength=100`,
 * así el porcentaje ES el desfase y no hay que calcular circunferencias.
 */
export function Anillo({ pct, size = 18, grosor = 2.2 }: { pct: number; size?: number; grosor?: number }) {
  const r = (size - grosor) / 2;
  const c = size / 2;
  const valor = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${valor}% de avance`} role="img" className="xr-anillo">
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface3)" strokeWidth={grosor} />
      {/* En 0 % no se pinta: el remate redondo dejaba un punto suelto. */}
      {valor > 0 && (
        <circle
          className="xr-anillo-valor"
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={valor >= 100 ? "var(--ok)" : "var(--text)"}
          strokeWidth={grosor}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          style={{ strokeDashoffset: 100 - valor, transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
      )}
    </svg>
  );
}

export function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="xr-chevron" data-abierto={abierto || undefined}>
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
