// El lienzo tarda: el recorrido puede tocar cientos de nodos y la página no se
// pinta hasta tenerlos. Sin esto, cambiar de vista deja la pantalla anterior
// congelada y parece que el clic no ha hecho nada.
export default function Loading() {
  return (
    <div className="gr-shell">
      <div className="gr-cargando">Recorriendo el grafo…</div>
    </div>
  );
}
