import { NextResponse } from "next/server";
import { asegurarBriefDeHoy } from "@/lib/ritual/brief";

/**
 * El respaldo del brief del arranque guiado (D-165), por HTTP y no como Server
 * Action. NO ES UNA PREFERENCIA DE ESTILO: lo encontró la prueba de navegador.
 *
 * Next.js ejecuta EN FILA las Server Actions que lanza un mismo cliente. El
 * respaldo se dispara al montar el overlay y puede tardar hasta treinta
 * segundos esperando al agente; como Server Action, todo lo que la persona hacía
 * después —marcar su hábito, omitir, terminar— quedaba encolado detrás de la
 * llamada al modelo, y el ritual parecía congelado justo el día en que el brief
 * faltaba. Un `fetch` a esta ruta no entra en esa cola.
 *
 * La sesión es la de siempre: el middleware deja pasar `/api/*` con sesión y
 * devuelve 401 en JSON sin ella, y `asegurarBriefDeHoy` lo vuelve a comprobar.
 */
export const dynamic = "force-dynamic";
// Agente (hasta veinte segundos) más respaldo (diez): el mismo techo que la
// página de rutinas, por el mismo motivo.
export const maxDuration = 60;

export async function POST() {
  const r = await asegurarBriefDeHoy();
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
