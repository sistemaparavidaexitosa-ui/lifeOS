import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip } from "@/components/ui";
import { updateProfile, addCategory } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: categories }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("categories").select("name").order("name")
  ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  return (
    <div className="flex flex-col gap-3.5">
      <Card>
        <h3 className="font-bold mb-2">Perfil y preferencias</h3>
        <form action={updateProfile} className="flex flex-col gap-2">
          <input name="name" defaultValue={profile.name} required />
          <div className="grid grid-cols-2 gap-2">
            <select name="currency" defaultValue={profile.currency}>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
            <select name="locale" defaultValue={profile.locale}>
              <option value="es-MX">es-MX</option>
              <option value="es-ES">es-ES</option>
              <option value="en-US">en-US</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input name="timezone" defaultValue={profile.timezone} />
            <select name="cycle" defaultValue={profile.cycle}>
              <option value="Quincenal">Quincenal</option>
              <option value="Mensual">Mensual</option>
              <option value="Semanal">Semanal</option>
            </select>
          </div>
          <button className="btn-primary" type="submit">
            Guardar
          </button>
        </form>
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Rango de actividad diario</h3>
        <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
          Determina dónde se calculan tus espacios disponibles en Autogestión del Tiempo.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Inicio</span>
            <b className="block text-lg">{profile.activity_window_start.slice(0, 5)}</b>
          </div>
          <div className="stat card" style={{ padding: 15 }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Fin</span>
            <b className="block text-lg">{profile.activity_window_end.slice(0, 5)}</b>
          </div>
        </div>
        <a href="/time" className="btn-ghost btn-sm mt-2 inline-block">
          Editar en Autogestión del Tiempo
        </a>
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Categorías de gasto</h3>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {(categories ?? []).map((c) => (
            <Chip key={c.name}>{c.name}</Chip>
          ))}
        </div>
        <form
          action={async (fd) => {
            "use server";
            await addCategory(String(fd.get("name")));
          }}
          className="flex gap-2"
        >
          <input name="name" placeholder="Nueva categoría" />
          <button className="btn-ghost btn-sm" type="submit">
            Añadir
          </button>
        </form>
      </Card>
    </div>
  );
}
