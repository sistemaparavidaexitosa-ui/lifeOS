"use server";

// FASE 4 — Bitácora (logbook) + Base de conocimiento (knowledge_items).
//
// Ambas tablas ya existían en el esquema desde
// 0003_execution_collaboration.sql, con RLS (`logbook_own`,
// `knowledge_items_own`) y GRANTs correctos — pero NINGÚN componente de la
// UI las leía ni escribía (funcionalidad "huérfana" detectada en el gap
// analysis original). Este archivo cierra ese gap con Server Actions
// simples de CRUD.
//
// Nota de alcance (BR-012 y consistentes): logbook/knowledge_items son
// privadas por user_id (NO tienen workspace_id ni pasan por
// has_project_access/can_edit_project) — project_id es solo una etiqueta
// opcional para filtrar/agrupar, no un mecanismo de colaboración. Por eso
// estas Server Actions no necesitan (ni deben) validar acceso de workspace.
//
// Ninguna migración SQL nueva es necesaria.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface LogEntry {
  id: string;
  project_id: string | null;
  type: "decision" | "change" | "comment" | "learning";
  text: string;
  created_at: string;
}

export interface KnowledgeItem {
  id: string;
  project_id: string | null;
  title: string;
  type: "doc" | "link" | "note" | "file";
  url: string;
  note: string;
  version: number;
  created_at: string;
}

/**
 * Carga la bitácora y la base de conocimiento de un proyecto en una sola
 * llamada — se invoca desde execution/page.tsx junto a la carga de tareas.
 */
export async function getProjectLogAndKnowledge(
  projectId: string
): Promise<{ logbook: LogEntry[]; knowledge: KnowledgeItem[] }> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const [{ data: logRows }, { data: knowledgeRows }] = await Promise.all([
    supabase
      .from("logbook")
      .select("id, project_id, type, text, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("knowledge_items")
      .select("id, project_id, title, type, url, note, version, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
  ]);

  return {
    logbook: (logRows ?? []) as LogEntry[],
    knowledge: (knowledgeRows ?? []) as KnowledgeItem[]
  };
}

const logSchema = z.object({
  projectId: z.string().uuid(),
  type: z.enum(["decision", "change", "comment", "learning"]),
  text: z.string().min(1)
});

/** FR-EXE-007/012: agrega una entrada a la bitácora (decisión, cambio, comentario o aprendizaje). */
export async function addLogEntry(projectId: string, type: string, text: string) {
  const parsed = logSchema.parse({ projectId, type, text });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("logbook").insert({
    user_id: user.id,
    project_id: parsed.projectId,
    type: parsed.type,
    text: parsed.text.trim()
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "logbook.add", object: parsed.projectId, meta: { type: parsed.type } });
  revalidatePath("/execution");
}

export async function deleteLogEntry(id: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("logbook").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "logbook.delete", object: id });
  revalidatePath("/execution");
}

const knowledgeSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  type: z.enum(["doc", "link", "note", "file"]),
  url: z.string().optional().default(""),
  note: z.string().optional().default("")
});

/** FR-EXE-008: agrega un ítem a la base de conocimiento (nota, enlace, documento o archivo). */
export async function addKnowledgeItem(projectId: string, title: string, type: string, url: string, note: string) {
  const parsed = knowledgeSchema.parse({ projectId, title, type, url, note });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("knowledge_items").insert({
    user_id: user.id,
    project_id: parsed.projectId,
    title: parsed.title.trim(),
    type: parsed.type,
    url: parsed.url.trim(),
    note: parsed.note.trim(),
    version: 1
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "knowledge.add", object: parsed.projectId, meta: { type: parsed.type } });
  revalidatePath("/execution");
}

/** FR-EXE-008: versión — cada edición incrementa `version` en vez de sobrescribir silenciosamente. */
export async function updateKnowledgeItem(id: string, title: string, url: string, note: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: item } = await supabase.from("knowledge_items").select("version").eq("id", id).single();
  if (!item) throw new Error("Ítem no encontrado");

  const { error } = await supabase
    .from("knowledge_items")
    .update({ title: title.trim(), url: url.trim(), note: note.trim(), version: item.version + 1 })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "knowledge.update", object: id });
  revalidatePath("/execution");
}

export async function deleteKnowledgeItem(id: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("knowledge_items").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "knowledge.delete", object: id });
  revalidatePath("/execution");
}
