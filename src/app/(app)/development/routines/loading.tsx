/**
 * Mientras Hoy se calcula (series de 400 días, identidad, brief): la forma de
 * la pantalla sin contenido, para que al llegar los datos nada salte.
 */
export default function RoutinesLoading() {
  const bloque = (alto: number) => (
    <div className="card" style={{ height: alto, background: "var(--surface)" }}>
      <div className="rounded" style={{ height: 12, width: "40%", background: "var(--surface2)" }} />
      <div className="rounded mt-3" style={{ height: 10, width: "75%", background: "var(--surface2)" }} />
      <div className="rounded mt-2" style={{ height: 10, width: "60%", background: "var(--surface2)" }} />
    </div>
  );
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Cargando rutinas">
      <div className="grid gap-3.5 md:grid-cols-2">
        {bloque(220)}
        {bloque(220)}
      </div>
      {bloque(260)}
      {bloque(320)}
    </div>
  );
}
