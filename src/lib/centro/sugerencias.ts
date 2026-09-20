import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { getUserTimeZone, todayForUser } from "@/lib/data/profile";
import { hourInTimeZone } from "@/lib/domain/datetime.ts";
import { prepararAnalisis, huellaDeHechos } from "@/lib/insights/generar-recomendaciones";
import { debeAnalizar } from "@/lib/domain/insights/nightly.ts";
import { franjaDeHoy, type Franja } from "@/lib/domain/centro/franja.ts";
import { sanearSugerencias } from "@/lib/domain/centro/sugerencias.ts";
import { NAV_ITEMS } from "@/components/nav-items";
import { generarSugerencias } from "./generar";

/**
 * Las sugerencias del centro (D-167): cuándo se piensan, cuándo no, y qué se
 * guarda.
 *
 * NUNCA LANZA. Una sugerencia es un extra; si algo falla, el centro se pinta
 * sin ella y la persona no se entera. Todo el archivo está dentro de un
 * `try/catch` por esa razón.
 *
 * EL ORDEN IMPORTA, y este es el que evita pagar de más:
 *
 *   1. ¿Ya se pensó en esta franja? → devolver lo que hay. Cero coste.
 *   2. ¿Hay hechos, y la IA está encendida? → si no, salir y anotarlo.
 *   3. ¿Cambió algo desde la franja anterior? → si no, devolver lo que hay.
 *   4. Reservar la franja ANTES de llamar al modelo (la clave primaria es la
 *      guarda: dos pestañas abiertas a la vez no pagan dos veces).
 *   5. Llamar, sanear, guardar.
 */

export interface SugerenciaView {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string;
  /** Solo en las de tipo `foco`. */
  href: string | null;
  motivo: string;
}

/** Los destinos que el modelo puede nombrar. La misma lista que la barra lateral. */
function destinosPermitidos(): string[] {
  return NAV_ITEMS.filter((n) => !n.hidden && n.href !== "/home" && n.href !== "/settings").map((n) => n.href);
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function pendientes(supabase: Db, userId: string): Promise<SugerenciaView[]> {
  const { data } = await supabase
    .from("coach_proposals")
    .select("id, tipo, titulo, detalle, payload")
    .eq("user_id", userId)
    .eq("origen", "centro")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(3);

  return (data ?? []).map((p) => {
    const payload = (p.payload ?? {}) as Record<string, string>;
    return {
      id: p.id,
      tipo: p.tipo,
      titulo: p.titulo,
      detalle: p.detalle,
      href: p.tipo === "foco" ? payload.href ?? null : null,
      motivo: payload.motivo ?? ""
    };
  });
}

export async function sugerenciasDelCentro(): Promise<SugerenciaView[]> {
  try {
    const user = await getSessionUser();
    if (!user) return [];

    const supabase = await createClient();
    const [today, timeZone] = await Promise.all([todayForUser(), getUserTimeZone()]);
    const franja: Franja = franjaDeHoy(hourInTimeZone(timeZone));

    // 1. ¿Ya se pensó en esta franja?
    const { data: corridas } = await supabase
      .from("centro_runs")
      .select("franja, facts_hash")
      .eq("user_id", user.id)
      .eq("local_date", today);

    const yaEnEstaFranja = (corridas ?? []).some((c) => c.franja === franja);
    if (yaEnEstaFranja) return pendientes(supabase, user.id);

    // 2. Los hechos, por la puerta de privacidad de siempre (`ai_domains`).
    const preparado = await prepararAnalisis({
      supabase,
      userId: user.id,
      scope: "global",
      today,
      modo: "sesion"
    });
    if (!preparado.ok) {
      await supabase
        .from("centro_runs")
        .insert({ user_id: user.id, local_date: today, franja, outcome: "ia-apagada" });
      return [];
    }

    // 3. ¿Cambió algo desde la franja anterior de hoy?
    const huella = huellaDeHechos(preparado.context);
    const anterior = (corridas ?? []).find((c) => c.facts_hash)?.facts_hash ?? null;
    const decision = debeAnalizar(preparado.context.facts.length, huella, anterior);
    if (decision !== "analizar") {
      await supabase
        .from("centro_runs")
        .insert({ user_id: user.id, local_date: today, franja, facts_hash: huella, outcome: decision });
      return pendientes(supabase, user.id);
    }

    // 4. Reservar la franja ANTES de llamar. Si otra pestaña llegó primero, su
    //    `insert` ya está y este falla: no se paga dos veces.
    const { error: reserva } = await supabase
      .from("centro_runs")
      .insert({ user_id: user.id, local_date: today, franja, facts_hash: huella, outcome: "pensando" });
    if (reserva) return pendientes(supabase, user.id);

    const [{ data: proyectos }, vivas] = await Promise.all([
      supabase.from("projects").select("id, title").eq("status", "Activo").limit(20),
      pendientes(supabase, user.id)
    ]);
    const lista = (proyectos ?? []).map((p) => ({ id: p.id, title: p.title }));

    // 5. Llamar, sanear, guardar.
    const generado = await generarSugerencias({
      context: preparado.context,
      franja,
      destinos: destinosPermitidos(),
      proyectos: lista,
      yaPropuestas: vivas.map((v) => v.titulo)
    });

    if (!generado.ok) {
      await supabase
        .from("centro_runs")
        .update({ outcome: generado.reason.slice(0, 120) })
        .eq("user_id", user.id)
        .eq("local_date", today)
        .eq("franja", franja);
      return vivas;
    }

    const sanas = sanearSugerencias(generado.crudas, {
      proyectos: lista,
      yaPropuestas: vivas.map((v) => v.titulo)
    });

    if (sanas.length > 0) {
      await supabase.from("coach_proposals").insert(
        sanas.map((s) => ({
          user_id: user.id,
          message_id: null,
          origen: "centro",
          tipo: s.tipo,
          titulo: s.titulo,
          detalle: s.detalle,
          payload: s.payload
        }))
      );
    }

    await Promise.all([
      supabase
        .from("centro_runs")
        .update({ outcome: `hecho:${sanas.length}` })
        .eq("user_id", user.id)
        .eq("local_date", today)
        .eq("franja", franja),
      supabase.from("audit_log").insert({ user_id: user.id, action: "ai.centro_sugerencias", object: franja })
    ]);

    return pendientes(supabase, user.id);
  } catch {
    return [];
  }
}
