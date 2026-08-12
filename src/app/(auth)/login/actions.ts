"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres")
});

export interface AuthActionState {
  error?: string;
}

/** FR-IAM-001: autenticación real vía Supabase Auth (email/password). */
export async function signIn(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.message };
  }
  redirect("/home");
}

export async function signUp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error, data } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password
  });
  if (error) {
    return { error: error.message };
  }
  if (data.session) {
    redirect("/onboarding");
  }
  return { error: "Revisa tu correo para confirmar tu cuenta antes de iniciar sesión." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
