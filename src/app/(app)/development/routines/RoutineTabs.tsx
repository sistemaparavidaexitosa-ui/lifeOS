"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/development/routines", label: "Hoy" },
  { href: "/development/routines/analytics", label: "Analítica" }
] as const;

/**
 * Hoy | Analítica. Dos rutas y no un estado de cliente: Analítica carga
 * Recharts y un año de series, y Hoy —la pantalla que se abre cada mañana— no
 * tiene por qué pagar ninguna de las dos cosas.
 */
export default function RoutineTabs() {
  const pathname = usePathname();
  return (
    <nav className="seg self-start" aria-label="Vistas de Rutinas">
      {TABS.map((t) => {
        const activa = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} className={`seg-item ${activa ? "active" : ""}`} aria-current={activa ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
