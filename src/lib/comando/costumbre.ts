import "server-only";
// src/lib/comando/costumbre.ts
// Qué sueles hacer a esta hora (D-185).
//
// Une las dos mitades que hasta ahora no se tocaban: `nav_visitas` guardaba por
// dónde pasas (D-183) y `libroDeNavegacion` sabía deducir el ritmo, pero nadie
// los llamaba. Aquí se juntan y el resultado entra en el Centro.
//
// NUNCA LANZA: si algo falla, no hay costumbre y el Centro se comporta como
// antes de que existiera esto.

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { libroDeNavegacion, preferenciaDeAhora, type Visita } from "@/lib/domain/comando/preferencias.ts";
import type { Franja } from "@/lib/domain/centro/franja.ts";
import type { Carril } from "@/lib/domain/comando/tipos.ts";
import { NAV_ITEMS } from "@/components/nav-items";

/**
 * De qué frente es una ruta.
 *
 * Se deduce del prefijo y no de `NAV_ITEMS.group` porque los grupos del menú
 * son seis y los frentes del Centro son tres: «Money OS (privado)» y «Panel»
 * no se corresponden uno a uno. Lo que no encaje en ninguno **no produce
 * costumbre** — es mejor no ofrecer nada que ofrecerlo en el frente
 * equivocado, que haría dudar de la etiqueta en todos los demás.
 */
function carrilDeRuta(ruta: string): Carril | null {
  if (ruta.startsWith("/money") || ruta.startsWith("/savings") || ruta.startsWith("/wealth")) return "money";
  if (ruta.startsWith("/development") || ruta.startsWith("/habits") || ruta.startsWith("/goals")) return "development";
  if (ruta.startsWith("/execution") || ruta.startsWith("/planning") || ruta.startsWith("/time")) return "execution";
  return null;
}

/** Cómo se llama en el menú. Sin entrada en el menú, no hay nombre que dar. */
function etiquetaDeRuta(ruta: string): string | null {
  const sinParametros = ruta.split("?")[0] ?? ruta;
  return NAV_ITEMS.find((n) => n.href === sinParametros)?.label ?? null;
}

export interface Costumbre {
  ruta: string;
  etiqueta: string;
  carril: Carril;
}

export async function costumbreDeAhora(franja: Franja): Promise<Costumbre | null> {
  try {
    const user = await getSessionUser();
    if (!user) return null;

    const supabase = await createClient();
    const { data } = await supabase
      .from("nav_visitas")
      .select("ruta, franja, local_date")
      .eq("user_id", user.id)
      // El tope existe porque alguien que usa mucho la aplicación acumula miles
      // de filas y la ventana de treinta días ya acota lo que cuenta.
      .order("local_date", { ascending: false })
      .limit(2000);

    if (!data?.length) return null;

    const hoy = new Date().toISOString().slice(0, 10);
    const visitas: Visita[] = data.map((v) => ({
      ruta: v.ruta,
      franja: v.franja as Franja,
      dia: v.local_date
    }));

    const preferida = preferenciaDeAhora(libroDeNavegacion(visitas, { hoy }), franja);
    if (!preferida) return null;

    const carril = carrilDeRuta(preferida.ruta);
    const etiqueta = etiquetaDeRuta(preferida.ruta);
    // Sin frente o sin nombre no se ofrece: una costumbre que no sabe cómo se
    // llama ni de qué parte de tu vida es, no es una sugerencia, es un enlace.
    if (!carril || !etiqueta) return null;

    return { ruta: preferida.ruta, etiqueta, carril };
  } catch {
    return null;
  }
}
