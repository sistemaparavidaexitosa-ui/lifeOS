import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./onboarding-form";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("user_id", user.id).single();
  if (profile?.onboarded) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");

  return (
    <div className="min-h-dvh grid place-items-center p-5" style={{ background: "var(--bg)" }}>
      <div className="card" style={{ maxWidth: 520, width: "100%" }}>
        <h2 className="text-lg font-bold mb-1">Bienvenido a Life OS</h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          Configura tu espacio. Money OS es siempre privado.
        </p>
        <OnboardingForm next={next} />
      </div>
    </div>
  );
}
