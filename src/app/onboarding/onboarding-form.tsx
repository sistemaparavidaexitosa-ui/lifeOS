"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

export default function OnboardingForm() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="field">
        <label className="block text-xs font-bold mb-1">Nombre</label>
        <input name="name" required defaultValue="" placeholder="Tu nombre" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label className="block text-xs font-bold mb-1">Moneda base</label>
          <select name="currency" defaultValue="MXN">
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Locale</label>
          <select name="locale" defaultValue="es-MX">
            <option value="es-MX">es-MX</option>
            <option value="es-ES">es-ES</option>
            <option value="en-US">en-US</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label className="block text-xs font-bold mb-1">Zona horaria</label>
          <input name="timezone" defaultValue="America/Mexico_City" />
        </div>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Ciclo de ingresos</label>
          <select name="cycle" defaultValue="Quincenal">
            <option value="Quincenal">Quincenal</option>
            <option value="Mensual">Mensual</option>
            <option value="Semanal">Semanal</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label className="block text-xs font-bold mb-1">Inicio de tu rango de actividad</label>
          <input name="activityStart" type="time" defaultValue="05:00" required />
        </div>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Fin de tu rango de actividad</label>
          <input name="activityEnd" type="time" defaultValue="21:00" required />
        </div>
      </div>
      <div className="note text-xs p-2 rounded-lg" style={{ background: "var(--surface2)" }}>
        Con tu rango de actividad calculamos los espacios disponibles de tu día (Autogestión del Tiempo, FR-TIM-002/003).
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="aiConsent" defaultChecked style={{ width: "auto", minHeight: "auto" }} />
        Autorizo personalización de IA (memoria y recomendaciones). Puedo revocarlo después.
      </label>
      {state.error && (
        <div className="text-xs p-2 rounded-lg" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
          {state.error}
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Guardando…" : "Comenzar"}
      </button>
    </form>
  );
}
