import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import NotificationsBell from "@/components/NotificationsBell";
import PushSetup from "@/components/PushSetup";
import { getPersonalWorkspace } from "@/lib/data/workspaces";
import { getSessionUser } from "@/lib/data/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getSessionUser();

  // Defensa en profundidad: el middleware ya redirige, pero cada Server
  // Component que lea datos privados debe volver a comprobar la sesión.
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("name, onboarded").eq("user_id", user.id).single();

  if (!profile?.onboarded) redirect("/onboarding");

  // La paleta busca dentro de UN espacio. El layout no sabe cuál mira la
  // pantalla (eso vive en `?ws=`, que es de cada ruta), así que usa el personal
  // como suelo: es el que siempre existe desde 0030 y el que la mayoría de las
  // pantallas abren por defecto.
  const personalWorkspace = await getPersonalWorkspace();

  // El plegado del rail del chat se lee AQUÍ y no en el cliente: con
  // `localStorage` el servidor pintaría siempre la misma forma y el ancho del
  // contenido se movería un frame después, en cada carga de página.
  const chatCollapsed = (await cookies()).get("lifeos_chat_collapsed")?.value === "1";

  return (
    <AppShell
      userName={profile.name || "Usuario"}
      workspaceId={personalWorkspace?.id ?? null}
      chatCollapsed={chatCollapsed}
      // Tras un límite de Suspense: la bandeja consulta en TODAS las pantallas
      // y no puede retrasar el pintado de ninguna. `null` de fallback porque un
      // esqueleto de campana parpadeando en cada navegación molesta más que
      // esperar medio segundo a que aparezca.
      bell={
        <Suspense fallback={null}>
          <NotificationsBell />
        </Suspense>
      }
    >
      {children}
      {/*
        No pinta nada: registra el service worker y revalida la suscripción en
        cada carga. Va dentro de AppShell y no en el <head> porque solo tiene
        sentido con sesión — a quien no ha entrado no hay a quién avisar.
      */}
      <PushSetup />
    </AppShell>
  );
}
