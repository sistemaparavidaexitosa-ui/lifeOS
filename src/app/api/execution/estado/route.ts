import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { aplicarCamino } from "@/lib/data/estado-tarea";

export const dynamic = "force-dynamic";

/**
 * Guarda los cambios de estado de la Lista cuando vence su «Deshacer», o de
 * golpe cuando la página se va (cambiar de app en el iPhone, cerrar, recargar).
 *
 * POR QUÉ ES UNA RUTA Y NO UNA SERVER ACTION
 * Next manda las Server Actions de una en una. Con varias tareas pendientes,
 * al salir las que seguían en cola se perdían. Esto es un `fetch` con
 * `keepalive`: no hace cola, va todo en una petición y el navegador la termina
 * aunque la página ya no exista.
 *
 * Cuerpo: { cambios: [{ id, pasos: TaskStatus[] }] }. Cada paso pasa por la
 * misma validación que setTaskStatus.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, reason: "No autenticado" }, { status: 401 });

  // Solo desde la propia app: JSON (otro sitio no puede mandarlo sin permiso
  // CORS) y, si el navegador dice de dónde viene, del mismo origen.
  const origen = request.headers.get("origin");
  if (!request.headers.get("content-type")?.includes("application/json") || (origen && origen !== new URL(request.url).origin)) {
    return NextResponse.json({ ok: false, reason: "Origen no permitido" }, { status: 403 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "Cuerpo no válido" }, { status: 400 });
  }
  const cambios = (cuerpo as { cambios?: unknown })?.cambios;
  if (!Array.isArray(cambios) || !cambios.length || cambios.length > 50) {
    return NextResponse.json({ ok: false, reason: "Sin cambios" }, { status: 400 });
  }

  const supabase = await createClient();
  const resultados: { id: string; ultimo: string | null; error: string | null }[] = [];
  for (const c of cambios as { id?: unknown; pasos?: unknown }[]) {
    if (typeof c?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(c.id)) continue;
    resultados.push({ id: c.id, ...(await aplicarCamino(supabase, user.id, c.id, c.pasos)) });
  }

  if (resultados.some((r) => r.ultimo)) {
    revalidatePath("/execution");
    revalidatePath("/home");
  }
  return NextResponse.json({ ok: true, resultados });
}
