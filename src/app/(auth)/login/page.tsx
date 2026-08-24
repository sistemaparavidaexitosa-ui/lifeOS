import { Suspense } from "react";
import LoginForm from "./login-form";

/**
 * F5 🔴, segunda parte: esta página TIENE que renderizarse por petición.
 *
 * La CSP lleva un nonce distinto en cada request (middleware.ts) y Next solo
 * puede escribir ese nonce en los `<script>` cuando renderiza en el momento de
 * la petición. Prerenderizada, el HTML se hornea en el build —cuando todavía no
 * existe ningún nonce— y en producción el navegador recibe 12 scripts sin
 * nonce contra una cabecera que exige uno: `strict-dynamic` los bloquea todos,
 * la página no hidrata y el usuario se queda mirando el "Cargando…" del
 * Suspense de abajo. Pasó en producción el 2026-08-24.
 *
 * Es el precio del nonce, y es barato: esta app ya tenía 30 rutas dinámicas.
 * Si algún día se quita el nonce de la CSP, esto puede volver a ser estático.
 */
export const dynamic = "force-dynamic";

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
