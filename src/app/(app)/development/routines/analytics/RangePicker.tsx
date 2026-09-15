import Link from "next/link";
import type { Rango } from "@/lib/domain/development/habit-dashboard.ts";

const OPCIONES: { value: Rango; label: string }[] = [
  { value: 7, label: "7 días" },
  { value: 30, label: "30 días" },
  { value: 90, label: "90 días" },
  { value: 365, label: "1 año" }
];

/**
 * El único filtro de la vista, encima de todo lo que acota: tarjetas, gráficas
 * y tabla se calculan contra el mismo rango, así que las cifras siempre casan.
 * Enlaces y no estado: el rango vive en la URL y se puede compartir o recargar.
 */
export default function RangePicker({ value }: { value: Rango }) {
  return (
    <nav className="seg self-start" aria-label="Rango de fechas">
      {OPCIONES.map((o) => (
        <Link
          key={o.value}
          href={`/development/routines/analytics?rango=${o.value}`}
          className={`seg-item ${o.value === value ? "active" : ""}`}
          aria-current={o.value === value ? "true" : undefined}
          scroll={false}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
