// Esqueleto genérico para cualquier ruta de la app que no traiga el suyo.
//
// Existe porque TODAS las rutas son dinámicas: cada navegación espera al
// servidor, y sin este archivo el navegador deja la pantalla anterior intacta
// mientras tanto. En un teléfono eso no se lee como "está cargando", se lee
// como "no pasó nada" — y el usuario vuelve a tocar.
export default function Loading() {
  return (
    <div className="sk-stack" role="status" aria-label="Cargando">
      <div className="sk sk-chip" />
      <div className="card sk-stack">
        <div className="sk sk-line" style={{ width: "45%" }} />
        <div className="sk sk-line" style={{ width: "80%" }} />
        <div className="sk sk-line" style={{ width: "65%" }} />
      </div>
      <div className="card sk-stack">
        <div className="sk sk-line" style={{ width: "35%" }} />
        <div className="sk sk-line" style={{ width: "70%" }} />
      </div>
    </div>
  );
}
