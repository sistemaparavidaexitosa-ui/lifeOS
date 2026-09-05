import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { updateProfile } from "./actions";
import AiSettings from "./AiSettings";
import Automations, { type AutomationRow } from "./Automations";
import PushNotifications from "./PushNotifications";
import type { ActionType, TriggerType } from "@/lib/domain/automations/rules.ts";
import { getSessionUser } from "@/lib/data/session";
import { isPlatformAdmin } from "@/lib/data/templates";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: automationRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase
      .from("automations")
      .select("id, name, enabled, authorized, trigger_type, action_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
  ]);
  if (!profile) throw new Error("Perfil no encontrado.");

  // El acceso al panel de plantillas vive aquí, y solo para quien lo puede
  // usar: /admin devuelve 404 a los demás, así que enseñar el enlace a todo el
  // mundo sería ofrecer una puerta que no abre.
  const esAdmin = await isPlatformAdmin();

  const automations: AutomationRow[] = (automationRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    authorized: r.authorized,
    triggerType: r.trigger_type as TriggerType,
    actionType: r.action_type as ActionType
  }));

  return (
    <div className="flex flex-col gap-3.5">
      <Card>
        <h3 className="font-bold mb-2">Perfil y preferencias</h3>
        <form action={updateProfile} className="flex flex-col gap-2">
          <div className="field">
            <label className="block text-xs font-bold mb-1">Nombre</label>
            <input name="name" defaultValue={profile.name} required />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="field">
              <label className="block text-xs font-bold mb-1">Moneda</label>
              <select name="currency" defaultValue={profile.currency}>
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div className="field">
              <label className="block text-xs font-bold mb-1">Locale</label>
              <select name="locale" defaultValue={profile.locale}>
                <option value="es-MX">es-MX</option>
                <option value="es-ES">es-ES</option>
                <option value="en-US">en-US</option>
              </select>
            </div>
            <div className="field">
              <label className="block text-xs font-bold mb-1">Ciclo de ingresos</label>
              <select name="cycle" defaultValue={profile.cycle}>
                <option value="Quincenal">Quincenal</option>
                <option value="Mensual">Mensual</option>
                <option value="Semanal">Semanal</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label className="block text-xs font-bold mb-1">Zona horaria</label>
            <input name="timezone" defaultValue={profile.timezone} required />
          </div>
          <button type="submit" className="btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>
            Guardar
          </button>
        </form>
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Rango de actividad diario</h3>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Determina dónde se calculan tus espacios disponibles en Autogestión del Tiempo.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Inicio
            </span>
            <b className="block">{profile.activity_window_start.slice(0, 5)}</b>
          </div>
          <div>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Fin
            </span>
            <b className="block">{profile.activity_window_end.slice(0, 5)}</b>
          </div>
        </div>
        <a href="/time" className="btn-ghost btn-sm" style={{ marginTop: 10 }}>
          Editar en Autogestión del Tiempo
        </a>
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Notificaciones</h3>
        <PushNotifications />
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Automatizaciones</h3>
        <Automations rules={automations} />
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Recomendaciones (Intelligence OS)</h3>
        <AiSettings enabled={(profile.ai_domains ?? []) as string[]} />
        {/*
          Intelligence OS dejó de ser una sección del menú lateral (ver
          nav-items.ts). Sus dos pantallas siguen existiendo y estos son sus
          accesos estables: la bandeja también se alcanza desde el panel de
          /money, pero la memoria solo se alcanzaba a través de ella, y una
          pantalla que depende de pasar por Dinero es una pantalla perdida.
        */}
        <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 10 }}>
          <a href="/intelligence" className="btn-ghost btn-sm">
            Ver recomendaciones
          </a>
          <a href="/intelligence/memory" className="btn-ghost btn-sm">
            Memoria del motor
          </a>
        </div>
      </Card>

      {esAdmin && (
        <Card>
          <h3 className="font-bold mb-2">Administración</h3>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            El catálogo de plantillas —proyectos, rutinas y hábitos— que ve <b>todo el mundo</b>. Lo que publiques aquí
            aparece en el selector de cada sección; al usar una plantilla se copia, así que editarla después no le cambia
            nada a quien ya la aplicó.
          </p>
          <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 10 }}>
            <Link href="/admin" className="btn-ghost btn-sm">
              Catálogo de plantillas
            </Link>
          </div>
        </Card>
      )}

      {/*
        Nota (16-ago-2026): se eliminó deliberadamente la sección "Categorías
        de gasto" de esta pantalla — decisión explícita del owner de que las
        categorías NO se gestionan desde Configuración. Ahora se definen
        directamente al crear un concepto en /money/budget (ver
        CreateBudgetButton.tsx / BudgetLineForm.tsx), que las crea
        automáticamente la primera vez que se escriben.
      */}
    </div>
  );
}
