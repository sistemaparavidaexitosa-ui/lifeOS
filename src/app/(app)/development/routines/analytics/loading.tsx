/** Mientras Analítica calcula un año de series: tarjetas y gráficas vacías con su tamaño. */
export default function AnalyticsLoading() {
  const tarjeta = (i: number) => (
    <div key={i} className="card" style={{ height: 96 }}>
      <div className="rounded" style={{ height: 10, width: "50%", background: "var(--surface2)" }} />
      <div className="rounded mt-3" style={{ height: 20, width: "35%", background: "var(--surface2)" }} />
    </div>
  );
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Cargando analítica">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))" }}>
        {Array.from({ length: 8 }, (_, i) => tarjeta(i))}
      </div>
      <div className="grid gap-3.5 md:grid-cols-2">
        <div className="card" style={{ height: 320 }} />
        <div className="card" style={{ height: 320 }} />
      </div>
    </div>
  );
}
