// src/lib/domain/centro/agente/grafica.ts
// El trazo de una serie como path SVG (D-194). Puro. Sin librería de gráficas:
// una línea y una sparkline no la justifican.
export function trazo(puntos: number[], ancho: number, alto: number): string {
  if (puntos.length < 2) return "";
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const r = (n: number) => Math.round(n * 100) / 100;
  return puntos
    .map((y, i) => {
      const px = r((i / (puntos.length - 1)) * ancho);
      const py = max === min ? r(alto / 2) : r(alto - ((y - min) / (max - min)) * alto);
      return `${i === 0 ? "M" : "L"}${px},${py}`;
    })
    .join(" ");
}
