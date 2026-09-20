import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { capturarIdea } from "@/lib/centro/capturar";
import { sanearCaptura } from "@/lib/domain/centro/captura.ts";

/**
 * La barra del centro (D-168).
 *
 * Ruta y no Server Action, por lo mismo que el resto de llamadas al modelo:
 * Next ejecuta en fila las Server Actions de un cliente, y mientras la IA
 * piensa la persona sigue usando el centro.
 *
 * LO QUE DEVUELVE NO ESCRIBE NADA TODAVÍA: si la idea tiene un destino claro,
 * se guarda como PROPUESTA y se devuelve su id. Crearla de verdad es el toque
 * de la persona en «Guardar» (D-153).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Entrada = z.object({ texto: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, reason: "Sin sesión." }, { status: 401 });

  const parsed = Entrada.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "Escribe algo primero." }, { status: 422 });

  const supabase = await createClient();
  const [{ data: notebooks }, { data: proyectos }] = await Promise.all([
    supabase.from("notebooks").select("id, title").limit(30),
    supabase.from("projects").select("id, title").eq("status", "Activo").limit(30)
  ]);

  const ctx = {
    notebooks: (notebooks ?? []).map((n) => ({ id: n.id, title: n.title })),
    proyectos: (proyectos ?? []).map((p) => ({ id: p.id, title: p.title }))
  };

  const salida = await capturarIdea({ texto: parsed.data.texto, ...ctx });
  if (!salida.ok) {
    return NextResponse.json({ ok: false, reason: salida.reason, cuadernos: ctx.notebooks }, { status: 503 });
  }

  const sana = sanearCaptura(salida.cruda, ctx);
  if (sana.clase === "pregunta") return NextResponse.json({ ok: true, resultado: sana });

  const payload = sana.clase === "nota" ? { notebookId: sana.notebookId, cuerpo: sana.cuerpo } : {};
  const { data: fila, error } = await supabase
    .from("coach_proposals")
    .insert({
      user_id: user.id,
      message_id: null,
      origen: "centro",
      tipo: sana.clase,
      titulo: sana.titulo,
      detalle: "",
      payload
    })
    .select("id")
    .single();

  if (error || !fila) return NextResponse.json({ ok: false, reason: "No se pudo guardar la propuesta." }, { status: 500 });

  const destino =
    sana.clase === "nota"
      ? ctx.notebooks.find((n) => n.id === sana.notebookId)?.title ?? "un cuaderno"
      : ctx.proyectos.find((p) => p.id === sana.projectId)?.title ?? "un proyecto";

  return NextResponse.json({ ok: true, resultado: { ...sana, id: fila.id, destino } });
}
