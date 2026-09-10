import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { publicEnv } from "@/config/env";

export const metadata: Metadata = {
  title: `${publicEnv.NEXT_PUBLIC_APP_NAME} · Aplicación`,
  description: "Organiza tu trabajo. Controla tu dinero. Construye tu patrimonio.",
  appleWebApp: {
    // F12: meta de web-app para lanzamiento a pantalla completa en iOS.
    capable: true,
    statusBarStyle: "default",
    title: publicEnv.NEXT_PUBLIC_APP_NAME
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // F12: viewport-fit=cover + safe-area para layout nativo en móvil.
  viewportFit: "cover",
  themeColor: "#0b8f75"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // EL TEMA SE LEE DE UNA COOKIE Y NO DE `profiles.theme`, y hay una razón.
  // Este layout envuelve TODAS las páginas, incluidas /login y /invite, que no
  // tienen sesión: ir a la base a preguntar el tema añadiría una consulta a
  // cada petición de la aplicación entera para pintar un atributo. La cookie la
  // escribe `toggleTheme` junto a la columna —que sigue siendo la verdad y la
  // que sincroniza entre dispositivos—, y aquí se lee gratis. Es el mismo
  // patrón que `lifeos_chat_collapsed` en (app)/layout.tsx.
  //
  // La consecuencia aceptada: en un dispositivo nuevo se ve el tema claro hasta
  // que la persona entra en Configuración una vez.
  const theme = (await cookies()).get("lifeos_theme")?.value === "dark" ? "dark" : "light";

  return (
    <html lang="es-MX" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
