// src/lib/ai-chat/cerebro.ts
// El contexto y las herramientas del chat, para quien los necesite (D-194).
//
// Estaba dentro de `sendChatMessage`. El Centro-agente usa el MISMO cerebro
// (decisión del usuario: mismo modelo, herramientas y memoria; hilo propio), y
// copiarlo habría sido la quinta copia del trayecto de contexto que
// AGENTIC_KERNEL_ARCHITECTURE.md ya contaba cuatro veces.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { loadFacts, type Db } from "@/lib/insights/facts-loader";
import { allowedDomains, buildContext, type InsightContext } from "@/lib/insights/context";
import { loadChainFacts } from "@/lib/insights/graph-context";
import { crearCajaDeHerramientas, type CajaDeHerramientas } from "@/lib/ai/tools";
import type { Domain } from "@/lib/domain/insights/types.ts";
import type { MemoryItemLike, MemoryScope } from "@/lib/domain/insights/memory.ts";

/** Sin `profiles.currency`/`profiles.locale` (no debería pasar, la columna existe). */
const MONEDA_DEFECTO = "MXN";
const LOCALE_DEFECTO = "es-MX";

export interface Cerebro {
  supabase: Db;
  user: { id: string };
  today: string;
  context: InsightContext;
  herramientas: CajaDeHerramientas | null;
  moneda: string;
  locale: string;
}

/**
 * El contexto y las herramientas de una sesión, listos para preguntarle al
 * modelo. `null` sin sesión: quien llama decide qué hacer con eso, igual que
 * antes hacía `sendChatMessage` con su propio `if (!user) return`.
 *
 * `sesion` es opcional: quien ya tiene cliente y usuario en la mano —como
 * `sendChatMessage`, que los necesita de todas formas para guardar la
 * pregunta— los pasa, y esto se ahorra el `createClient()` y el
 * `getSessionUser()` (un `GET /auth/v1/user` real) de más. Sin `sesion`
 * —el Centro-agente, que no los tiene— se resuelve por su cuenta.
 */
export async function prepararCerebro(sesion?: { supabase: Db; user: { id: string } }): Promise<Cerebro | null> {
  const supabase = sesion?.supabase ?? (await createClient());
  const user = sesion?.user ?? (await getSessionUser());
  if (!user) return null;

  // Ya no se leen `accounts` ni `family_members`: solo servían para construir
  // el mapa de alias, que 0053 retiró. Dos viajes de red menos por turno.
  const [zonaHoraria, { data: profile }, { data: memory }] = await Promise.all([
    getUserTimeZone(),
    supabase
      .from("profiles")
      .select("quincenal_income, ai_domains, activity_window_start, activity_window_end, currency, locale")
      .eq("user_id", user.id)
      .single(),
    supabase.from("memory_items").select("*").order("created_at", { ascending: false })
  ]);

  const today = todayLocal(zonaHoraria);

  // El opt-in por dominio manda igual que en `analyze()` (§4.2), y el corte es
  // igual de TEMPRANO: si el usuario no autorizó nada, sus tablas ni se tocan.
  // A diferencia del motor, aquí no se aborta — un chat que se niega a hablar
  // es peor que uno honesto sobre lo que no sabe. Se contesta sin hechos.
  const enabledDomains = (profile?.ai_domains ?? []) as Domain[];
  const permitidos = allowedDomains("global").filter((d) => enabledDomains.includes(d));

  const facts = permitidos.length
    ? await loadFacts(supabase, user.id, permitidos, today, {
        quincenalIncome: profile?.quincenal_income ?? 0,
        window: {
          start: (profile?.activity_window_start ?? "08:00").slice(0, 5),
          end: (profile?.activity_window_end ?? "18:00").slice(0, 5)
        }
      })
    : [];

  // Las cadenas del grafo van DESPUÉS de los hechos porque salen de ellos: se
  // recorre hacia arriba desde lo que los sustenta. Van con la sesión, así que
  // la regla de visibilidad es la de siempre.
  if (facts.length) facts.push(...(await loadChainFacts(supabase, facts, permitidos, { modo: "sesion" })));

  const context = buildContext({
    scope: "global",
    facts,
    previousRejections: [],
    enabledDomains,
    todayISO: today,
    memory: (memory ?? []).map(
      (m): MemoryItemLike => ({
        id: m.id,
        scope: m.scope as MemoryScope,
        origin: m.origin as MemoryItemLike["origin"],
        text: m.text,
        validUntil: m.valid_until
      })
    )
  });

  // La caja se crea SIEMPRE que haya algún dominio autorizado, y con los mismos
  // permisos que ya se aplicaron a los hechos: no hay un segundo opt-in.
  const herramientas = permitidos.length
    ? crearCajaDeHerramientas({
        supabase,
        userId: user.id,
        autorizados: permitidos,
        today,
        profile: {
          quincenalIncome: profile?.quincenal_income ?? 0,
          window: {
            start: (profile?.activity_window_start ?? "08:00").slice(0, 5),
            end: (profile?.activity_window_end ?? "18:00").slice(0, 5)
          }
        }
      })
    : null;

  return {
    supabase,
    user: { id: user.id },
    today,
    context,
    herramientas,
    moneda: profile?.currency ?? MONEDA_DEFECTO,
    locale: profile?.locale ?? LOCALE_DEFECTO
  };
}
