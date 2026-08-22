"use server";
// Canje del token de invitación. Toda la validación (vigencia, un solo uso,
// coincidencia del correo) ocurre dentro del RPC accept_invitation
// (migración 0022), de forma atómica y con SELECT ... FOR UPDATE: dos clics
// simultáneos no pueden canjear el mismo token dos veces.
//
// Aquí NO se usa el cliente service_role: el RPC es SECURITY DEFINER
// justamente para no tener que saltarse RLS desde la app.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.string().uuid();

export interface AcceptResult {
  ok: boolean;
  message: string;
  workspaceId: string | null;
}

export async function acceptInvitation(token: string): Promise<AcceptResult> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) {
    return { ok: false, message: "Enlace de invitación inválido.", workspaceId: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: parsed.data });
  if (error) {
    return { ok: false, message: error.message, workspaceId: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, message: "No se pudo procesar la invitación.", workspaceId: null };
  }

  if (row.ok) {
    revalidatePath("/workspaces");
    revalidatePath("/execution");
  }
  return { ok: row.ok, message: row.message, workspaceId: row.workspace_id ?? null };
}
