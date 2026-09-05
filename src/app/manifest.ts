import type { MetadataRoute } from "next";
import { publicEnv } from "@/config/env";

/**
 * El manifest de la PWA — se sirve en `/manifest.webmanifest`.
 *
 * Va aquí y no como archivo estático en `public/` por dos razones: Next
 * inyecta solo el `<link rel="manifest">` en el `<head>`, y el nombre sale de
 * la misma variable que el resto de la app en vez de quedar duplicado a mano
 * en un JSON.
 *
 * ⚠️ SIN ESTO NO HAY NOTIFICACIONES EN IPHONE. iOS solo entrega Web Push a una
 * app añadida a la pantalla de inicio (16.4+), y solo ofrece añadirla en
 * condiciones si hay manifest válido con iconos de 192 y 512. En Android el
 * push funciona sin instalar nada, pero el manifest es lo que convierte la
 * pestaña en algo que se abre a pantalla completa.
 *
 * ⚠️ El middleware TIENE que dejar pasar esta ruta sin sesión. Si la redirige a
 * /login, el navegador recibe HTML donde espera JSON y la instalación falla en
 * silencio, sin ningún error que apunte a la causa (ver src/middleware.ts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: publicEnv.NEXT_PUBLIC_APP_NAME,
    short_name: publicEnv.NEXT_PUBLIC_APP_NAME,
    description: "Organiza tu trabajo. Controla tu dinero. Construye tu patrimonio.",
    lang: "es-MX",
    // `/home` y no `/`: la raíz solo decide a dónde mandarte, y arrancar la app
    // instalada en una redirección es un parpadeo gratis en cada apertura.
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0b8f75",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // `maskable` aparte y con el dibujo más pequeño: Android recorta el icono
      // a la forma que use el lanzador, y sin una versión con margen la
      // palomita se queda sin puntas.
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
