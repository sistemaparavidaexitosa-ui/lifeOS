import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
