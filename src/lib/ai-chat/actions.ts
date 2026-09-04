"use server";
// EL CHAT DE IA TRANSVERSAL.
//
// Va en su propio archivo y no en `lib/insights/actions.ts` porque responde a
// otra pregunta. El motor de recomendaciones es proactivo: mira los hechos y
// avisa. Esto es lo contrario — el usuario pregunta y hay que contestarle.
// Comparten la tubería de datos (facts-loader + context) y nada más.
//
// NINGÚN CAMINO DE ESCRITURA NUEVO. Lo único que el chat puede provocar en el
// resto de la app es una tarea, y la crea `quickAddTask`, que ya existe y a su
// vez reusa `createTask`. Mismo criterio que D-075 tomó con el planificador.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { loadFacts, type Db } from "@/lib/insights/facts-loader";
import { allowedDomains, buildAliasMap, buildContext, restore } from "@/lib/insights/context";
import { chatReply } from "@/lib/ai/chat";
import { recortarHistorial, type ChatMessageLike } from "@/lib/domain/ai/chat.ts";
import { quickAddTask } from "@/lib/search/quick-add";
import type { Domain } from "@/lib/domain/insights/types.ts";
import type { MemoryItemLike, MemoryScope } from "@/lib/domain/insights/memory.ts";

/**
 * Cuántos turnos se PINTAN. Más que los que viajan al modelo (MAX_TURNOS):
 * poder subir y releer lo de ayer no le cuesta tokens a nadie.
 */
const MAX_HISTORIAL = 100;

export interface ChatMessage extends ChatMessageLike {
  /** Los hechos que el modelo citó. Vacío en los turnos del usuario. */
  factIds: string[];
}

export interface SendResult {
  ok: boolean;
  /** El turno del asistente, ya guardado. Ausente si el modelo falló. */
  reply?: ChatMessage;
  /** Una tarea que el modelo propone y el usuario todavía no ha confirmado. */
  proposedTask?: string;
  reason?: string;
}

function toMessage(row: { id: string; role: string; content: string; fact_ids: string[] | null; created_at: string }): ChatMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    factIds: row.fact_ids ?? [],
    createdAt: row.created_at
  };
}

/**
 * La lectura, sin comprobar sesión: RLS ya decide qué filas se ven, y quien
 * llama a esto dentro de un turno ya tiene el usuario en la mano. Estaba
 * pegada a `loadChatHistory`, así que `sendChatMessage` pagaba un viaje a Auth
 * de más por cada mensaje enviado.
 */
async function readHistory(supabase: Db): Promise<ChatMessage[]> {
  // Descendente porque ese es el índice (0045); se le da la vuelta aquí, que
  // es como se lee un chat. Pedirlo ascendente traería los MÁS VIEJOS al topar.
  const { data } = await supabase
    .from("ai_chat_messages")
    .select("id, role, content, fact_ids, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORIAL);

  return (data ?? []).map(toMessage).reverse();
}

export async function loadChatHistory(): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return [];
  return readHistory(supabase);
}

/**
 * Un turno completo: se guarda lo que dijo el usuario, se arma el contexto, se
 * pregunta y se guarda la respuesta.
 *
 * EL TURNO DEL USUARIO SE GUARDA AUNQUE EL MODELO FALLE. Es deliberado: si se
 * guardaran los dos juntos al final, una cuota agotada borraría lo que la
 * persona acababa de escribir, que es lo único de los dos que no se puede
 * regenerar.
 */
export async function sendChatMessage(text: string): Promise<SendResult> {
  const message = z.string().min(1).max(4000).safeParse(text.trim());
  if (!message.success) return { ok: false, reason: "Escribe algo primero." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  // TODO LO QUE NO DEPENDE DE NADA, A LA VEZ — incluido guardar la pregunta.
  //
  // Antes esto era una cascada: se esperaba a que la pregunta estuviera
  // escrita, luego a la zona horaria, luego a las lecturas. Tres esperas de red
  // en fila que nadie estaba usando para nada, delante de una llamada al modelo
  // que ya es lenta de por sí. Se lanza la escritura sin esperarla y se recoge
  // más abajo, justo antes de preguntar: sigue siendo un requisito que la
  // pregunta quede guardada aunque el modelo falle, pero no hay motivo para
  // que las lecturas se queden mirando.
  const guardarPregunta = supabase
    .from("ai_chat_messages")
    .insert({ user_id: user.id, role: "user", content: message.data })
    .select("id")
    .single();

  const [zonaHoraria, { data: profile }, { data: accounts }, { data: members }, { data: memory }, historial] =
    await Promise.all([
      getUserTimeZone(),
      supabase
        .from("profiles")
        .select("quincenal_income, ai_domains, activity_window_start, activity_window_end")
        .eq("user_id", user.id)
        .single(),
      supabase.from("accounts").select("name").order("created_at"),
      supabase.from("family_members").select("name").order("created_at"),
      supabase.from("memory_items").select("*").order("created_at", { ascending: false }),
      // `readHistory` y no `loadChatHistory`: esta función ya comprobó la
      // sesión, y volver a preguntársela a Auth era otro viaje de red de más.
      readHistory(supabase)
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

  // Los nombres reales no salen del servidor (§4.2). El mapa se queda aquí y
  // se usa para devolverlos al pintar la respuesta.
  const aliases = buildAliasMap([
    ...(accounts ?? []).map((a) => ({ kind: "account" as const, name: a.name })),
    ...(members ?? []).map((m) => ({ kind: "member" as const, name: m.name }))
  ]);

  const context = buildContext({
    scope: "global",
    facts,
    previousRejections: [],
    aliases,
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

  // Aquí sí se espera: si la pregunta no se pudo guardar, no se gasta una
  // llamada al modelo en un turno que no va a quedar registrado.
  const { data: pregunta, error: insertErr } = await guardarPregunta;
  if (insertErr) return { ok: false, reason: insertErr.message };

  const result = await chatReply({
    context,
    // El historial se leyó EN PARALELO con la escritura de la pregunta, así que
    // puede haberla pillado o no según cuál llegara antes. Se descarta por id y
    // no por posición: así la conversación previa es la misma pase lo que pase,
    // en vez de depender de una carrera. (Antes era `slice(0, -1)`, que asumía
    // que siempre estaba la última.)
    history: recortarHistorial(historial.filter((m) => m.id !== pregunta?.id)),
    message: message.data
  });

  // El rastro de auditoría no lo está esperando nadie: sale después de que la
  // respuesta ya viaje al navegador. `after` y no una promesa suelta porque en
  // una Server Action lo que no se espera se puede quedar a medias al cerrar
  // la petición.
  after(async () => {
    await supabase.from("audit_log").insert({
      user_id: user.id,
      action: "ai.chat",
      object: "global",
      meta: { domains: context.domains, facts: context.facts.length, ok: result.ok }
    });
  });

  if (!result.ok) return { ok: false, reason: result.reason };

  // Los alias vuelven a ser nombres justo antes de guardarse: lo que se lee en
  // pantalla —y lo que quedará en el historial— dice «Cuenta Nómina», no
  // «Cuenta #2». El mapa nunca sale de este proceso.
  const texto = restore(result.text, aliases);

  const { data: saved, error: replyErr } = await supabase
    .from("ai_chat_messages")
    .insert({ user_id: user.id, role: "assistant", content: texto, fact_ids: result.factIds })
    .select("id, role, content, fact_ids, created_at")
    .single();
  if (replyErr || !saved) return { ok: false, reason: replyErr?.message ?? "No se pudo guardar la respuesta." };

  return {
    ok: true,
    reply: toMessage(saved),
    proposedTask: result.proposedTask ? restore(result.proposedTask, aliases) : undefined
  };
}

/**
 * Crear la tarea que el chat propuso. Solo corre tras el clic en «Crear»: el
 * modelo propone, la persona decide.
 */
export async function createTaskFromChat(workspaceId: string, title: string) {
  const ws = z.string().uuid().safeParse(workspaceId);
  if (!ws.success) return { ok: false as const, reason: "No hay un espacio donde crear la tarea." };
  return quickAddTask(ws.data, title);
}

/**
 * Vaciar la conversación. La llama `clearAiHistory` en Configuración, para que
 * «borrar el historial de IA» siga significando todo lo que la IA guardó.
 */
export async function clearChat(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("ai_chat_messages").delete().eq("user_id", user.id);
  revalidatePath("/home");
}
