"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signUp, type AuthActionState } from "./actions";

const initialState: AuthActionState = {};

export default function LoginForm() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {message && (
        <div className="text-xs p-2 rounded-lg" style={{ background: "var(--surface2)", color: "var(--muted)" }}>
          {message}
        </div>
      )}
      <div className="field">
        <label className="block text-xs font-bold mb-1">Correo</label>
        <input name="email" type="email" required autoComplete="email" placeholder="tu@correo.com" />
      </div>
      <div className="field">
        <label className="block text-xs font-bold mb-1">Contraseña</label>
        <input name="password" type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
      </div>
      {state.error && (
        <div className="text-xs p-2 rounded-lg" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
          {state.error}
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Procesando…" : mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
      </button>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
      </button>
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Demo: <code>luis.demo@lifeos.local</code> / <code>LifeosDemo!2026</code> (ver /supabase/seed.sql)
      </p>
    </form>
  );
}
