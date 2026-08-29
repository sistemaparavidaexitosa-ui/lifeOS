import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { getSessionUser } from "@/lib/data/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getSessionUser();

  // Defensa en profundidad: el middleware ya redirige, pero cada Server
  // Component que lea datos privados debe volver a comprobar la sesión.
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("name, onboarded").eq("user_id", user.id).single();

  if (!profile?.onboarded) redirect("/onboarding");

  return <AppShell userName={profile.name || "Usuario"}>{children}</AppShell>;
}
