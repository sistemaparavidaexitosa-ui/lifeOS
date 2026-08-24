import Link from "next/link";

/**
 * 404 propio, y `force-dynamic` por la misma razón que el login: con una CSP
 * de nonce por petición, una página prerenderizada llega al navegador con sus
 * scripts sin nonce y no hidrata (ver el comentario largo en
 * `(auth)/login/page.tsx`). El 404 de fábrica de Next es estático.
 */
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="min-h-dvh grid place-items-center p-5" style={{ background: "var(--bg)" }}>
      <div className="card" style={{ maxWidth: 420, textAlign: "center" }}>
        <h2 className="text-lg font-bold mb-1">Aquí no hay nada</h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          La página que buscas no existe o cambió de sitio.
        </p>
        <Link className="btn-primary btn-sm" href="/home">
          Ir al panel
        </Link>
      </div>
    </div>
  );
}
