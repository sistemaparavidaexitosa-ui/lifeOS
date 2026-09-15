"use client";

/**
 * El tooltip de todas las gráficas: primero el valor, fuerte, y debajo lo que
 * es. El lector ya sabe qué gráfica mira; lo que busca al pasar el dedo es el
 * número. La clave de la serie es una raya del color de la marca, no una caja.
 */
export default function ChartTooltip({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div className="chart-tooltip" role="status">
      <div>
        <span className="key" aria-hidden="true" />
        <b>{value}</b>
      </div>
      <div style={{ color: "var(--muted)" }}>{label}</div>
      {detail && <div style={{ color: "var(--muted)" }}>{detail}</div>}
    </div>
  );
}
