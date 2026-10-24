// Esqueleto de Execution.
//
// Repite la FORMA de lo que va a llegar —título, línea de pulso y tarjetas—
// en vez de un spinner centrado: el contenido aparece donde ya estaba
// mirando el ojo, sin el salto de sustituir un spinner por una lista.
import "./execution.css";

export default function Loading() {
  return (
    <main className="ex-main xr" role="status" aria-label="Cargando proyectos">
      <div className="xr-portada">
        <div className="xr-portada-cabeza">
          <div style={{ display: "grid", gap: 10 }}>
            <div className="sk" style={{ width: 168, height: 34 }} />
            <div className="sk" style={{ width: 220, height: 16 }} />
          </div>
        </div>
        <div className="xr-tarjetas">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sk" style={{ height: 72, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    </main>
  );
}
