"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";

import { todayForUser } from "@/lib/data/profile";
import type { Scope } from "./context";
import { prepararAnalisis, recomendarYGuardar, type AnalyzeResult } from "./generar-recomendaciones";
import { canTransition, type RecommendationStatus } from "@/lib/domain/insights/states.ts";
import { DOMAIN_LABEL, type Domain } from "@/lib/domain/insights/types.ts";
import { MEMORY_SCOPES, type MemoryOrigin } from "@/lib/domain/insights/memory.ts";
import { actionFailed, type ActionResult } from "@/lib/supabase/errors";

/**
 * Intelligence OS — el análisis lo dispara el usuario y es informativo.
 *
 * El orden importa y es el del spec (§3.5): cargar datos → extraer hechos →
 * filtrar contexto → modelo → validar anclaje → escribir. La carga vive en
 * `facts-loader.ts` y el filtro en `context.ts` —que sigue siendo el único
 * sitio donde ese filtro se aplica (D-027) y se puede probar sin base de
 * datos—; aquí solo se orquestan los pasos y se escribe el resultado.
 *
 * Cubre los cinco dominios personales —`money`, `debt`, `time`, `execution` y
 * `habits`— y con ellos el ámbito `global`, que es el único que los cruza.
 *
 * `activity` va aparte y NO entra en `global`: habla del equipo, no del usuario
 * (ver allowedDomains en context.ts).
 */
export type { AnalyzeResult } from "./generar-recomendaciones";

/**
 * Dónde vive el panel de cada ámbito, para revalidar la ruta que de verdad hay
 * que repintar. No es "dónde están los datos" sino "dónde está el botón": el
 * de `habits` se embebe en el panel de Desarrollo Personal, no en la pantalla
 * de hábitos (ver InsightSection en development/page.tsx).
 */
const SCOPE_PATH: Record<Scope, string> = {
  money: "/money",
  debt: "/debt",
  habits: "/development",
  time: "/time",
  execution: "/execution",
  activity: "/activity",
  nutrition: "/development/nutrition",
  growth: "/development/goals",
  global: "/home"
};

export async function analyze(scope: Scope): Promise<AnalyzeResult> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, created: 0, reason: "No autenticado" };

  const preparado = await prepararAnalisis({ supabase, userId: user.id, scope, today: await todayForUser(), modo: "sesion" });
  if (!preparado.ok) return { ok: false, created: 0, reason: preparado.reason };

  const resultado = await recomendarYGuardar({ supabase, userId: user.id, scope, context: preparado.context, origen: "manual" });

  if (resultado.ok) {
    revalidatePath(SCOPE_PATH[scope]);
    // Los insights de hábitos también se leen en Hoy de Rutinas (F5).
    if (scope === "habits") revalidatePath("/development/routines");
    revalidatePath("/intelligence");
  }
  return resultado;
}

/**
 * Mueve una recomendación por la máquina de estados (§5.1). La transición se
 * valida contra el estado REAL en la base, no contra el que traiga el cliente:
 * la bandeja puede estar desactualizada en otra pestaña.
 */
export async function setRecommendationStatus(id: string, to: RecommendationStatus): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const { data: current } = await supabase.from("recommendations").select("status").eq("id", id).single();
  if (!current) return { ok: false, reason: "La recomendación ya no existe." };

  const from = current.status as RecommendationStatus;
  if (!canTransition(from, to)) return { ok: false, reason: `No se puede pasar de ${from} a ${to}.` };

  const { error } = await supabase.from("recommendations").update({ status: to }).eq("id", id);
  if (error) return actionFailed(error);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "ai.recommendation.status",
    object: id,
    meta: { from, to }
  });

  revalidatePath("/money");
  revalidatePath("/intelligence");
  return { ok: true };
}

/**
 * El usuario ajusta el texto antes de darlo por bueno. Pasa a `Edited`, que es
 * un estado vivo: sigue esperando decisión, pero ya no es lo que el modelo
 * escribió y la bandeja lo distingue.
 */
export async function editRecommendationText(id: string, text: string): Promise<ActionResult> {
  const limpio = text.trim();
  if (!limpio) return { ok: false, reason: "El texto no puede quedar vacío." };

  const supabase = await createClient();
  const { data: current } = await supabase.from("recommendations").select("status").eq("id", id).single();
  if (!current) return { ok: false, reason: "La recomendación ya no existe." };
  if (!canTransition(current.status as RecommendationStatus, "Edited") && current.status !== "Edited") {
    return { ok: false, reason: "Esta recomendación ya no se puede editar." };
  }

  const { error } = await supabase.from("recommendations").update({ text: limpio, status: "Edited" }).eq("id", id);
  if (error) return actionFailed(error);

  revalidatePath("/money");
  revalidatePath("/intelligence");
  return { ok: true };
}

// --- Memoria (§6) -----------------------------------------------------------

/**
 * Alta y edición de una nota de memoria, y el ÚNICO sitio que escribe en
 * `memory_items`.
 *
 * `origin` distingue quién la redactó, no quién la autorizó: la de origen `ai`
 * sale de una propuesta del chat que el usuario confirmó con un botón (D-089).
 * Ninguna de las dos se escribe sola — lo que cambia es a quién se le atribuye
 * el texto cuando después se lee en `/intelligence/memory`.
 */
export async function upsertMemoryItem(
  id: string | null,
  formData: FormData,
  origin: MemoryOrigin = "user"
): Promise<ActionResult> {
  const text = String(formData.get("text") ?? "").trim();
  const scope = String(formData.get("scope") ?? "");
  const validUntilRaw = String(formData.get("validUntil") ?? "").trim();

  if (!text) return { ok: false, reason: "Escribe la nota." };
  if (!(MEMORY_SCOPES as readonly string[]).includes(scope)) return { ok: false, reason: "Ámbito inválido." };

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const payload = { scope, text, valid_until: validUntilRaw || null };
  const { error } = id
    ? await supabase.from("memory_items").update(payload).eq("id", id)
    : await supabase.from("memory_items").insert({ ...payload, user_id: user.id, origin });
  if (error) return actionFailed(error);

  revalidatePath("/intelligence/memory");
  return { ok: true };
}

export async function deleteMemoryItem(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("memory_items").delete().eq("id", id);
  revalidatePath("/intelligence/memory");
}

// --- Configuración del motor (§4.2, §4.4) -----------------------------------

/**
 * Qué dominios autoriza el usuario a enviar al modelo. Se reemplaza la lista
 * completa en cada guardado: es una casilla por dominio, no un incremental.
 */
export async function setAiDomains(formData: FormData): Promise<void> {
  // La lista sale del tipo, no de una cadena escrita a mano: si mañana aparece
  // un dominio nuevo y esta línea se queda atrás, su casilla se guardaría como
  // apagada para siempre sin que nada falle.
  const domains = (Object.keys(DOMAIN_LABEL) as Domain[]).filter((d) => formData.get(`domain.${d}`) === "on");

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return;

  await supabase.from("profiles").update({ ai_domains: domains }).eq("user_id", user.id);
  await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.optin", object: "", meta: { domains } });

  revalidatePath("/settings");
  revalidatePath("/money");
}

/**
 * §4.4: borrar TODO el historial de IA. Sin vuelta atrás.
 *
 * Incluye la conversación del chat (0045) —y con ella los mensajes del coach y
 * sus propuestas, que cuelgan de esos turnos— y no solo las recomendaciones. El
 * botón promete «borrar el historial de IA», y una conversación que sobreviva
 * a ese botón convierte la promesa en media verdad — es, además, el sitio
 * donde el modelo escribió con más detalle sobre la vida del usuario.
 */
export async function clearAiHistory(): Promise<void> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return;

  await supabase.from("recommendations").delete().eq("user_id", user.id);
  // Las propuestas del coach se van con esto SIN una sentencia más: cuelgan del
  // turno que las explicaba con `on delete cascade` (0053). Se dice aquí porque
  // desde este archivo no se ve, y alguien podría añadir el delete que sobra.
  await supabase.from("ai_chat_messages").delete().eq("user_id", user.id);
  // Los briefs de identidad (0065) son lo que la IA escribió sobre quién quiere
  // ser la persona: la promesa del botón los incluye. El tope diario sigue
  // contándose en audit_log, que no se borra.
  await supabase.from("identity_briefs").delete().eq("user_id", user.id);
  await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.clear.history", object: "" });
  revalidatePath("/intelligence");
  revalidatePath("/money");
  revalidatePath("/settings");
  revalidatePath("/home");
}

/** §4.4: borrar toda la memoria. */
export async function clearMemory(): Promise<void> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return;

  await supabase.from("memory_items").delete().eq("user_id", user.id);
  await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.clear.memory", object: "" });
  revalidatePath("/intelligence/memory");
  revalidatePath("/settings");
}
