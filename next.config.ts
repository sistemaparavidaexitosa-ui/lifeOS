import type { NextConfig } from "next";

// F5: La CSP con nonce por request se define en middleware.ts, NUNCA aquí como
// header estático (una CSP estática sin nonce bloquea los scripts inline de
// Next y produce pantalla en blanco en producción). Aquí solo van headers NO-CSP.
// F6: typedRoutes desactivado deliberadamente — ver /docs/DECISIONS.md (D-006):
// no aportaba valor claro frente al riesgo de RouteImpl<string> en rutas dinámicas.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
