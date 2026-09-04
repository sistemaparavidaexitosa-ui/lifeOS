import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Los avisos que aún no han salido hacia este usuario.
 *
 * ES UNA RED DE SEGURIDAD, NO EL CAMINO NORMAL. El contenido de una
 * notificación viaja cifrado dentro del propio push (RFC 8291), así que el
 * service worker casi nunca necesita venir aquí. Solo lo hace si el evento
 * llegó sin cuerpo o con un cuerpo ilegible — y sin esta ruta ese caso
 * acabaría en el mensaje del navegador «Este sitio se ha actualizado en
 * segundo plano».
 *
 * La sesión viaja en la cookie: el service worker hace el `fetch` con
 * `credentials: "include"` sobre el mismo origen. Si la sesión caducó, el
 * middleware devuelve 401 y el service worker cae en su aviso genérico.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "No autenticado" }, { status: 401 });

  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, href, dedupe_key")
    .is("delivered_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    notifications: (data ?? []).map((n) => ({
      title: n.title,
      body: n.body,
      href: n.href,
      dedupeKey: n.dedupe_key
    }))
  });
}
