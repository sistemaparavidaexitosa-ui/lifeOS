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
  },
  // SIN ESTO EL IPHONE NO TIENE ICONO. Los archivos existían en
  // public/icons/ desde el primer día, pero nadie los enlazaba: ni aquí ni por
  // convención de Next (que solo mira src/app/icon.png y src/app/apple-icon.png,
  // no public/). Sin <link rel="apple-touch-icon"> iOS no se inventa nada —
  // guarda una miniatura de la propia página como icono del acceso directo.
  // El manifest tampoco sirve para esto: Safari no saca de ahí el icono de la
  // pantalla de inicio.
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    // 180 es la medida que pide iOS y la única que hace falta: el sistema
    // reescala de ahí hacia abajo.
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }]
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
