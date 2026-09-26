// src/lib/centro/agente/eventos.ts
// Lo que la persona hace en el Centro y le sirve para aprender (D-204).
// Registros en audit_log con la sesión; nunca lanzan ni frenan el turno.
"use server";

import { z } from "zod";
import { requireUser } from "@/lib/data/session";
import { IDS_DE_CHIPS } from "@/lib/domain/centro/agente/chips.ts";

const Resultado = z.enum(["seguir", "alternativa", "otra"]);

export async function registrarEntendimiento(resultado: "seguir" | "alternativa" | "otra"): Promise<void> {
  try {
    const r = Resultado.safeParse(resultado);
    if (!r.success) return;
    const { supabase, user } = await requireUser();
    await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.centro_entendimiento", object: "centro", meta: { resultado: r.data } });
  } catch (e) {
    console.warn("[centro-agente] registrarEntendimiento:", e);
  }
}

export async function registrarChip(id: string): Promise<void> {
  try {
    if (typeof id !== "string" || !IDS_DE_CHIPS.has(id)) return;
    const { supabase, user } = await requireUser();
    await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.centro_chip", object: "centro", meta: { id } });
  } catch (e) {
    console.warn("[centro-agente] registrarChip:", e);
  }
}
