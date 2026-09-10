import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/data/session";
import { loadSubgraph } from "@/lib/data/graph";
import { resolveView } from "@/lib/domain/graph/views";

export const dynamic = "force-dynamic";

/**
 * El trozo de grafo que cuelga de un nodo.
 *
 * POR QUÉ ES UNA RUTA Y NO UNA SERVER ACTION
 * Es la única lectura del módulo que arranca en el NAVEGADOR: cuando alguien
 * hace doble clic en un nodo del borde para expandirlo, el lienzo pide más
 * grafo sin volver a montar la página. Una Server Action para eso obligaría a
 * pasar por el ciclo de render de React y a devolver props, cuando lo que hace
 * falta es un `fetch` que devuelve JSON y se mete en el mapa que ya está en
 * memoria. Lo demás del módulo sí son Server Components y Server Actions.
 *
 * La sesión viaja en la cookie del mismo origen; el middleware devuelve 401 en
 * JSON —no un redirect— para las rutas /api, así que el lienzo puede
 * distinguir «caducó tu sesión» de «no hay nada ahí».
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, reason: "No autenticado" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const root = params.get("root");
  if (root === null || !/^[0-9a-f-]{36}$/i.test(root)) {
    return NextResponse.json({ ok: false, reason: "Falta el nodo de partida." }, { status: 400 });
  }

  const view = resolveView(params.get("view"));
  // La expansión pide UN salto, no la profundidad entera de la vista: quien
  // expande quiere ver lo que cuelga de ese nodo, no volver a traerse el grafo
  // que ya tiene en pantalla.
  const depthParam = Number(params.get("depth"));
  const depth = Number.isFinite(depthParam) && depthParam >= 1 && depthParam <= 8 ? Math.floor(depthParam) : 1;

  const subgrafo = await loadSubgraph(root, view, depth, 300);
  return NextResponse.json({ ok: true, ...subgrafo });
}
