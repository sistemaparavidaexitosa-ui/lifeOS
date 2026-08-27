import { Suspense } from "react";
import LoginForm from "./login-form";

/**
 * 🔴 Esta página TIENE que renderizarse por request. No es una preferencia.
 *
 * La CSP de `src/middleware.ts` usa `script-src 'nonce-… ' 'strict-dynamic'`, y
 * `strict-dynamic` ANULA `'self'`: con él presente, un `<script src="/_next/…">`
 * sin nonce ya no se carga por ser del mismo origen. El nonce solo lo inyecta
 * Next.js en el HTML cuando hay un request de por medio.
 *
 * Al ser esta la ÚNICA página prerenderizada de la app (las demás leen cookies
 * y ya son dinámicas), su HTML se generaba en build sin un solo `nonce=` y
 * después se servía desde la caché de Vercel junto a una cabecera CSP con un
 * nonce nuevo por request. Resultado: el navegador bloqueaba TODOS los scripts,
 * React nunca hidrataba y el usuario se quedaba mirando el fallback del
 * <Suspense> — el famoso "Cargando…" eterno en /login (2026-08-26), con la
 * app entera inaccesible porque el login es la puerta de entrada.
 *
 * Ver también `next.config.ts`: misma trampa, otra cara.
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
