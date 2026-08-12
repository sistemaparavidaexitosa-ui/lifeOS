import { Suspense } from "react";
import LoginForm from "./login-form";

// F7 🔴: cualquier lectura de useSearchParams debe envolverse en <Suspense>
// para evitar el bailout de prerender ("should be wrapped in a suspense boundary").
export default function LoginPage() {
  return (
    <div className="min-h-dvh grid place-items-center p-5" style={{ background: "var(--bg)" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <div className="flex items-center gap-2 pb-3">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center text-white font-black"
            style={{ background: "linear-gradient(145deg, var(--accent), var(--accent2))" }}
          >
            L
          </div>
          <div>
            <div className="font-black tracking-tight">Life OS</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Organiza tu trabajo. Controla tu dinero. Construye tu patrimonio.
            </div>
          </div>
        </div>
        <Suspense fallback={<div className="text-sm" style={{ color: "var(--muted)" }}>Cargando…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
