import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/data/session";
import { listarWatchlist } from "@/lib/money/watchlist-actions";
import { cotizaciones } from "@/lib/money/polygon";
import Buscador from "./Buscador";

export default async function WatchlistPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const seguidos = await listarWatchlist();

  // Los precios se piden AQUÍ, en cada pintada, y nunca se guardan: un precio
  // en la base envejece en segundos y se enseñaría como propio sin poder
  // responder por él.
  const cot = await cotizaciones(seguidos.map((s) => s.ticker));

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h2 className="text-2xl font-black" style={{ letterSpacing: "-0.03em" }}>
          Watchlist
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Lo que sigues del mercado. Los precios llegan de Polygon en cada visita y <b>van con retraso</b>: sirven
          para saber cómo va el día, no para decidir una operación al segundo. No se guardan.
        </p>
      </div>

      <Buscador
        inicial={seguidos}
        cotizaciones={cot.ok ? cot.datos : []}
        avisoDeMercado={cot.ok ? null : cot.reason}
      />
    </div>
  );
}
