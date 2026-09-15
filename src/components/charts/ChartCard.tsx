import type { ReactNode } from "react";
import { Card } from "@/components/ui";

/**
 * Marco de una gráfica: título, una línea que dice qué se mira, la gráfica y
 * sus datos en tabla.
 *
 * La tabla no es adorno: el tooltip mejora la lectura pero no puede ser la
 * única forma de llegar a un valor —con teclado, lector de pantalla o en un
 * teléfono sin hover no existe—. Va plegada para no competir con la gráfica.
 */
export default function ChartCard({
  title,
  subtitle,
  children,
  table
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Encabezados y filas de la vista en tabla. */
  table?: { head: string[]; rows: (string | number)[][] };
}) {
  return (
    <Card className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-bold text-sm">{title}</h3>
        {subtitle && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
      {table && table.rows.length > 0 && (
        <details className="chart-data">
          <summary>Ver datos</summary>
          <div className="overflow-x-auto mt-2" style={{ maxHeight: 280 }}>
            <table>
              <thead>
                <tr>
                  {table.head.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}
