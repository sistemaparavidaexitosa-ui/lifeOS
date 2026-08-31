import Link from "next/link";
import type { Quincena } from "@/lib/domain/quincena.ts";
import { shiftQuincena } from "@/lib/domain/quincena.ts";

/**
 * Navegación entre quincenas. Server component a propósito: son enlaces, no
 * estado — la quincena vive en el querystring (`?q=2026-08-Q2`) para que la
 * vista sea compartible y el botón "atrás" del navegador funcione.
 */
export default function QuincenaSwitcher({ current, isCurrent }: { current: Quincena; isCurrent: boolean }) {
  const previous = shiftQuincena(current, -1);
  const next = shiftQuincena(current, 1);

  return (
    <div className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Link href={`/money/budget?q=${previous.key}`} className="btn-ghost btn-sm" aria-label={`Ir a ${previous.label}`}>
        ‹
      </Link>
      <b style={{ minWidth: 190, textAlign: "center" }}>{current.label}</b>
      <Link href={`/money/budget?q=${next.key}`} className="btn-ghost btn-sm" aria-label={`Ir a ${next.label}`}>
        ›
      </Link>
      {!isCurrent && (
        <Link href="/money/budget" className="btn-ghost btn-sm">
          Hoy
        </Link>
      )}
    </div>
  );
}
