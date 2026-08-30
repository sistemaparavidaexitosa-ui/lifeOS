import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import MentionsBell from "@/components/MentionsBell";
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

  return (
    <AppShell
      userName={profile.name || "Usuario"}
      workspaceId={personalWorkspace?.id ?? null}
      // Tras un límite de Suspense: la bandeja consulta en TODAS las pantallas
      // y no puede retrasar el pintado de ninguna. `null` de fallback porque un
      // esqueleto de campana parpadeando en cada navegación molesta más que
      // esperar medio segundo a que aparezca.
      bell={
        <Suspense fallback={null}>
          <MentionsBell />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
