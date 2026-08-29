// Esqueleto de la cartera de proyectos.
//
// Repite la FORMA de lo que va a llegar —barra del espacio y filas de tablero—
// en vez de un spinner centrado: así el contenido aparece donde ya estaba
// mirando el ojo, sin el salto que produce sustituir un spinner por una lista.
export default function Loading() {
  return (
    <main className="ex-main" role="status" aria-label="Cargando proyectos">
      <div className="sk-bar">
        <div className="sk sk-chip" />
        <div className="sk sk-chip" style={{ width: 168 }} />
        <div className="sk sk-chip" style={{ width: 92 }} />
      </div>
      <div className="sk-stack" style={{ gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sk sk-row" />
        ))}
      </div>
    </main>
  );
}
