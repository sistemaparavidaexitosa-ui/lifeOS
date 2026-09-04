import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * El navegador rotó la suscripción por su cuenta (`pushsubscriptionchange`).
 *
 * Es una ruta y no una Server Action porque quien llama es el service worker,
 * que no puede invocar acciones de React. Sustituye la fila vieja por la nueva
 * en una sola pasada: dejar la anterior significaría seguir empujando a un
 * endpoint muerto hasta que un 410 lo limpiara.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "No autenticado" }, { status: 401 });

  let cuerpo: { anterior?: string; nueva?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "Cuerpo inválido" }, { status: 400 });
  }

  const endpoint = cuerpo.nueva?.endpoint;
  const p256dh = cuerpo.nueva?.keys?.p256dh;
  const auth = cuerpo.nueva?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, reason: "Suscripción incompleta" }, { status: 400 });
  }

  if (cuerpo.anterior && cuerpo.anterior !== endpoint) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", cuerpo.anterior).eq("user_id", user.id);
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      last_seen_at: new Date().toISOString(),
      failure_count: 0
    },
    { onConflict: "endpoint" }
  );

  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
