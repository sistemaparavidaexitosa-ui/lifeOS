// Esqueleto de la estantería de cuadernos: misma rejilla que NotebookGrid.
export default function Loading() {
  return (
    <main className="nb-main" role="status" aria-label="Cargando cuadernos">
      <div className="sk-bar">
        <div className="sk sk-chip" />
        <div className="sk sk-chip" style={{ width: 168 }} />
        <div className="sk sk-chip" style={{ width: 140 }} />
      </div>
      <div className="sk-grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="sk sk-tile" />
        ))}
      </div>
    </main>
  );
}
